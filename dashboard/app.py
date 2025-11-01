import json
import os
import threading
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from kafka import KafkaConsumer

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP", "kafka:9093")
ROOMS = [r.strip() for r in os.getenv("DASHBOARD_ROOMS", "CR-101,CR-102,CR-103,CR-104,CR-105").split(",") if r.strip()]
POLL_SECONDS = int(os.getenv("DASHBOARD_POLL_SECONDS", "5"))
ALERT_LIMIT = int(os.getenv("DASHBOARD_ALERT_LIMIT", "50"))

app = FastAPI(title="IoT Automation Dashboard")
BASE_DIR = Path(__file__).parent
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

data_lock = threading.Lock()
alerts: deque[Dict[str, Any]] = deque(maxlen=ALERT_LIMIT)
sensor_state: Dict[str, Dict[str, Any]] = {
    room: {"co2": None, "temp": None, "motion": None, "lux": None, "updated": None}
    for room in ROOMS
}
room_state: Dict[str, Dict[str, str]] = {
    room: {"lights": "Unknown", "door": "Unknown", "hvac": "Unknown"}
    for room in ROOMS
}

_consumers_started = False


def _ts_to_iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value) / 1000.0, timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        except Exception:
            return str(value)
    return str(value)


def _normalise_room(payload: Dict[str, Any]) -> str | None:
    keys = {k.lower(): v for k, v in payload.items()}
    for key in ("roomId", "room_id", "ROOMID"):
        if key in payload and payload[key]:
            return str(payload[key])
    if "roomid" in keys and keys["roomid"]:
        return str(keys["roomid"])
    return None


def _ensure_room(room: str) -> None:
    if room not in sensor_state:
        sensor_state[room] = {"co2": None, "temp": None, "motion": None, "lux": None, "updated": None}
    if room not in room_state:
        room_state[room] = {"lights": "Unknown", "door": "Unknown", "hvac": "Unknown"}


def handle_alert(payload: Dict[str, Any]) -> None:
    room = _normalise_room(payload)
    if not room:
        return
    action = payload.get("action") or payload.get("ACTION")
    rule = payload.get("rule") or payload.get("RULE")
    msg = payload.get("msg") or payload.get("message") or payload.get("MSG")
    ts_raw = payload.get("ts") or payload.get("TS")
    record = {
        "roomId": room,
        "action": action or "",
        "rule": rule or "",
        "msg": msg or "",
        "ts": _ts_to_iso(ts_raw),
    }
    with data_lock:
        alerts.appendleft(record)


def handle_telemetry(payload: Dict[str, Any]) -> None:
    room = payload.get("room_id") or payload.get("roomId") or payload.get("ROOM_ID")
    if not room:
        room = _normalise_room(payload)
    if not room:
        return
    _ensure_room(room)
    reading_type = payload.get("type", "").lower()
    updated = _ts_to_iso(payload.get("ts"))
    with data_lock:
        state = sensor_state.setdefault(room, {"co2": None, "temp": None, "motion": None, "lux": None, "updated": None})
        if reading_type == "sensor.co2":
            value = payload.get("co2_value")
            if value is None:
                value = payload.get("ppm") or payload.get("value")
            try:
                value = float(value) if value is not None else None
            except Exception:
                pass
            state["co2"] = value
            state["updated"] = updated
        elif reading_type == "sensor.temperature":
            value = payload.get("temp_value")
            if value is None:
                value = payload.get("value")
            try:
                value = float(value) if value is not None else None
            except Exception:
                pass
            state["temp"] = value
            state["updated"] = updated
        elif reading_type == "sensor.motion":
            motion_active = payload.get("motion_active")
            state["motion"] = None if motion_active is None else bool(motion_active)
            state["updated"] = updated
        elif reading_type == "sensor.lux":
            value = payload.get("lux_value")
            if value is None:
                value = payload.get("value")
            try:
                value = float(value) if value is not None else None
            except Exception:
                pass
            state["lux"] = value
            state["updated"] = updated
        elif reading_type == "sensor.door":
            door_closed = payload.get("door_closed")
            if door_closed is None:
                door_value = "Unknown"
            else:
                door_value = "Closed" if door_closed else "Open"
            room_state.setdefault(room, {"lights": "Unknown", "door": "Unknown", "hvac": "Unknown"})["door"] = door_value
            sensor_state.setdefault(room, state)["updated"] = updated
        else:
            state["updated"] = state.get("updated") or updated


def handle_command(payload: Dict[str, Any]) -> None:
    room = payload.get("room_id") or payload.get("roomId")
    if not room:
        room = _normalise_room(payload)
    if not room:
        return
    _ensure_room(room)
    device = payload.get("device_id") or payload.get("deviceId") or ""
    args_raw = payload.get("args")
    if isinstance(args_raw, str):
        try:
            args = json.loads(args_raw)
        except Exception:
            args = {}
    elif isinstance(args_raw, dict):
        args = args_raw
    else:
        args = {}
    cmd_value = (args.get("cmd") or args.get("mode") or "").upper()
    with data_lock:
        if device.upper() == "LIGHT":
            if cmd_value == "OFF":
                room_state[room]["lights"] = "Off"
            elif cmd_value == "ON":
                room_state[room]["lights"] = "On"
            elif cmd_value == "DIM":
                target = args.get("target")
                if target == 0:
                    room_state[room]["lights"] = "Dimming to Off"
                else:
                    room_state[room]["lights"] = f"Dim {target}"
            else:
                room_state[room]["lights"] = cmd_value or "Unknown"
        elif device.upper() == "HVAC":
            if cmd_value in {"ECO", "BOOST", "COMFORT"}:
                room_state[room]["hvac"] = cmd_value
            elif args.get("setpoint") is not None:
                room_state[room]["hvac"] = f"Setpoint {args['setpoint']}"
            else:
                room_state[room]["hvac"] = cmd_value or "Unknown"


def _consumer_loop(topic: str, handler, group_suffix: str) -> None:
    while True:
        try:
            consumer = KafkaConsumer(
                topic,
                bootstrap_servers=KAFKA_BOOTSTRAP,
                value_deserializer=lambda m: json.loads(m.decode("utf-8")),
                key_deserializer=lambda k: k.decode("utf-8") if k else None,
                group_id=f"dashboard-{group_suffix}",
                auto_offset_reset="latest",
                enable_auto_commit=True,
            )
            for msg in consumer:
                try:
                    handler(msg.value)
                except Exception as exc:  # noqa: BLE001
                    print(f"Handler error on {topic}: {exc}", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"Kafka connection error for {topic}: {exc}", flush=True)
            time.sleep(5)


def start_consumers() -> None:
    global _consumers_started
    if _consumers_started:
        return
    _consumers_started = True
    threads = [
        ("iot.alerts", handle_alert, "alerts"),
        ("iot.telemetry", handle_telemetry, "telemetry"),
        ("iot.commands", handle_command, "commands"),
    ]
    for topic, handler, suffix in threads:
        thread = threading.Thread(target=_consumer_loop, args=(topic, handler, suffix), daemon=True)
        thread.start()


start_consumers()


@app.get("/", response_class=HTMLResponse)
def index(request: Request) -> HTMLResponse:
    with data_lock:
        initial_alerts = list(alerts)
        sensors_copy = {room: dict(values) for room, values in sensor_state.items()}
        rooms_copy = {room: dict(values) for room, values in room_state.items()}
    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "rooms": ROOMS,
            "refresh_seconds": POLL_SECONDS,
            "alerts": initial_alerts,
            "sensors": sensors_copy,
            "room_state": rooms_copy,
        },
    )


@app.get("/api/dashboard", response_class=JSONResponse)
def api_dashboard() -> JSONResponse:
    with data_lock:
        data = {
            "alerts": list(alerts),
            "sensors": {room: dict(values) for room, values in sensor_state.items()},
            "rooms": {room: dict(values) for room, values in room_state.items()},
        }
    return JSONResponse(data)


@app.get("/healthz")
def healthcheck() -> Dict[str, str]:
    return {"status": "ok"}
