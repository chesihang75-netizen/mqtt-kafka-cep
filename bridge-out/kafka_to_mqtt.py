import json
import paho.mqtt.client as mqtt
from kafka import KafkaConsumer

MQTT_HOST = "mqtt"
MQTT_PORT = 1883
KAFKA_BOOTSTRAP = "kafka:9093"
KAFKA_TOPIC = "iot.commands"

consumer = KafkaConsumer(
    KAFKA_TOPIC,
    bootstrap_servers=KAFKA_BOOTSTRAP,
    auto_offset_reset="earliest",
    enable_auto_commit=True,
    value_deserializer=lambda m: json.loads(m.decode("utf-8")),
    key_deserializer=lambda k: k.decode("utf-8") if k else None,
    group_id="mqtt_bridge",
)

client = mqtt.Client()
client.connect(MQTT_HOST, MQTT_PORT, 60)
client.loop_start()

def publish_cmd(msg):
    site_id  = msg.get("site_id", "MAIN")
    room_id  = msg.get("room_id", "UNKNOWN")
    device_id= msg.get("device_id", "unknown")
    topic = f"site/{site_id}/room/{room_id}/device/{device_id}/cmd"
    payload = json.dumps({
        "cmd": msg.get("cmd", "switch"),
        "args": msg.get("args", {}),
        "corr_id": msg.get("corr_id", ""),
        "ts": msg.get("ts"),
    })
    client.publish(topic, payload, qos=0, retain=False)
    print("← MQTT", topic, payload, flush=True)

def main():
    for rec in consumer:
        try: publish_cmd(rec.value)
        except Exception as e: print("ERR", e, flush=True)

if __name__ == "__main__":
    main()
