import os, time, json
from datetime import datetime, timezone
from kafka import KafkaProducer

KAFKA_BOOTSTRAP = "kafka:9093"
TOPIC = "iot.ticker"

rooms = os.getenv("ROOMS","CR-101,CR-102,CR-103,CR-104,CR-105").split(",")
site  = os.getenv("SITE_ID","MAIN").strip()

producer = KafkaProducer(
    bootstrap_servers=KAFKA_BOOTSTRAP,
    value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    key_serializer=lambda k: k.encode("utf-8"),
)

def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

while True:
    ts = now_iso()
    for r in rooms:
        r = r.strip()
        msg = {"ts": ts, "site_id": site, "room_id": r}
        producer.send(TOPIC, key=r, value=msg)
    producer.flush()
    print(f"ticker @ {ts} -> {len(rooms)} rooms", flush=True)
    time.sleep(60)
