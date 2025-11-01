import os, time, json
from datetime import datetime, timezone
from kafka import KafkaProducer

BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP","kafka:9093")
ROOMS = [s.strip() for s in os.getenv("TICKER_ROOM_IDS","CR-101,CR-102").split(",")]
SITE  = os.getenv("TICKER_SITE_ID","MAIN")
PERIOD = int(os.getenv("TICKER_PERIOD_SEC","30"))

producer = KafkaProducer(
    bootstrap_servers=BOOTSTRAP,
    value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    key_serializer=lambda k: k.encode("utf-8"),
)

while True:
    now_ms = int(datetime.now(timezone.utc).timestamp()*1000)
    for r in ROOMS:
        msg = {"site_id": SITE, "room_id": r, "now_ms": now_ms}
        producer.send("iot.ticker", key=r, value=msg)
    producer.flush()
    time.sleep(PERIOD)
