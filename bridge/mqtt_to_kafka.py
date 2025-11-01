import json, re
from datetime import datetime, timezone
import paho.mqtt.client as mqtt
from kafka import KafkaProducer

MQTT_HOST = "mqtt"
MQTT_PORT = 1883
KAFKA_BOOTSTRAP = "kafka:9093"
KAFKA_TOPIC = "iot.telemetry"

producer = KafkaProducer(
    bootstrap_servers=KAFKA_BOOTSTRAP,
    value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    key_serializer=lambda k: k.encode("utf-8"),
)

topic_pat = re.compile(r"^site/([^/]+)/room/([^/]+)/device/([^/]+)/telemetry$")

def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def on_connect(client, userdata, flags, rc):  # v1 回调：4参
    print("MQTT connected", rc, flush=True)
    client.subscribe("site/+/room/+/device/+/telemetry", qos=0)

def on_message(client, userdata, msg):
    m = topic_pat.match(msg.topic)
    site_id, room_id, device_id = (None, None, None)
    if m: site_id, room_id, device_id = m.groups()
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except Exception:
        payload = {}
    ts    = payload.get("ts") or now_iso()
    type_ = payload.get("type")
    data  = payload.get("data", {})
    out = {
        "ts": ts,
        "site_id": payload.get("site_id") or site_id or "MAIN",
        "room_id": payload.get("room_id") or room_id or "UNKNOWN",
        "device_id": payload.get("device_id") or device_id or "unknown",
        "type": type_ or "sensor.unknown",
        "motion_active": None, "temp_value": None, "door_closed": None,
    }
    if type_ == "sensor.motion":
        out["motion_active"] = bool(data.get("active"))
    elif type_ == "sensor.temperature":
        try: out["temp_value"] = float(data.get("value"))
        except Exception: out["temp_value"] = None
    elif type_ == "sensor.door":
        if "closed" in data:
            out["door_closed"] = bool(data["closed"])
        elif "state" in data:
            out["door_closed"] = str(data["state"]).lower() in ("closed","close","1","true")
    key = out["room_id"]
    producer.send(KAFKA_TOPIC, key=key, value=out)
    producer.flush()
    print("→ Kafka", key, out, flush=True)

def main():
    client = mqtt.Client()  # v1：不要 CallbackAPIVersion
    client.on_connect = on_connect
    client.on_message = on_message
    client.reconnect_delay_set(min_delay=1, max_delay=30)
    client.connect_async(MQTT_HOST, MQTT_PORT, 60)
    client.loop_forever(retry_first_connection=True)

if __name__ == "__main__":
    main()
