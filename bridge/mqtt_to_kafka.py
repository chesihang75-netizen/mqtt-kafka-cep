import json
import re
import os
from datetime import datetime, timezone
import paho.mqtt.client as mqtt
from kafka import KafkaProducer

# -------- Config (env first, fallback defaults) --------
MQTT_HOST = os.getenv("MQTT_HOST", "mqtt")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9093")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "iot.input")

print("Starting mqtt-to-kafka bridge")
print("MQTT:", MQTT_HOST, MQTT_PORT)
print("Kafka:", KAFKA_BOOTSTRAP, "topic:", KAFKA_TOPIC, flush=True)

producer = KafkaProducer(
    bootstrap_servers=KAFKA_BOOTSTRAP,
    api_version_auto_timeout_ms=10000,
    value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    key_serializer=lambda k: k.encode("utf-8"),
)

# MQTT topic: site/{building}/room/{room}/device/{device}/telemetry
topic_pat = re.compile(r"^site/([^/]+)/room/([^/]+)/device/([^/]+)/telemetry$")


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def on_connect(client, userdata, flags, rc):
    print("MQTT connected", rc, flush=True)
    client.subscribe("site/+/room/+/device/+/telemetry", qos=0)


def on_message(client, userdata, msg):
    m = topic_pat.match(msg.topic)

    building_id, room_id, device_id = (None, None, None)
    if m:
        building_id, room_id, device_id = m.groups()

    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except Exception:
        payload = {}

    ts = payload.get("ts") or now_iso()
    type_ = payload.get("type")
    data = payload.get("data", {})

    out = {
        "ts": ts,
        "buildingId": payload.get("site_id") or building_id or "B1",
        "roomId": payload.get("room_id") or room_id or "UNKNOWN",
        "deviceId": payload.get("device_id") or device_id or "unknown",
        "type": type_ or "sensor.unknown",
        "motion": None,
        "temp": None,
        "door": None,
    }

    if type_ == "sensor.motion":
        out["motion"] = bool(data.get("active"))

    elif type_ == "sensor.temperature":
        try:
            out["temp"] = float(data.get("value"))
        except Exception:
            out["temp"] = None

    elif type_ == "sensor.door":
        if "closed" in data:
            out["door"] = bool(data["closed"])
        elif "state" in data:
            out["door"] = str(data["state"]).lower() in ("closed", "close", "1", "true")

    # Kafka key: building + room (for partitioning)
    key = f"{out['buildingId']}|{out['roomId']}"

    producer.send(KAFKA_TOPIC, key=key, value=out)
    producer.flush()

    print("→ Kafka", key, out, flush=True)


def main():
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message

    client.reconnect_delay_set(min_delay=1, max_delay=30)
    client.connect_async(MQTT_HOST, MQTT_PORT, 60)
    client.loop_forever(retry_first_connection=True)


if __name__ == "__main__":
    main()
