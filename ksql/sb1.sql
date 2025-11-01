SET 'auto.offset.reset'='earliest';

-- ===== 清理（存在才删）=====
DROP STREAM IF EXISTS TELEMETRY;
DROP STREAM IF EXISTS TICKER;

DROP STREAM IF EXISTS MOTION_RAW DELETE TOPIC;
DROP STREAM IF EXISTS DOOR_RAW DELETE TOPIC;
DROP TABLE  IF EXISTS LAST_MOTION DELETE TOPIC;
DROP TABLE  IF EXISTS DOOR_STATE DELETE TOPIC;
DROP STREAM IF EXISTS AFTER_HOURS_EVAL DELETE TOPIC;
DROP STREAM IF EXISTS TRIGGERS DELETE TOPIC;
DROP STREAM IF EXISTS IOT_COMMANDS DELETE TOPIC;

-- ===== 输入：统一遥测 =====
CREATE STREAM TELEMETRY (
  room_id VARCHAR KEY,
  ts STRING,
  site_id STRING,
  device_id STRING,
  type STRING,
  motion_active BOOLEAN,
  temp_value DOUBLE,
  door_closed BOOLEAN
) WITH (
  KAFKA_TOPIC='iot.telemetry',
  VALUE_FORMAT='JSON'
);

-- ===== 输入：ticker（心跳）=====
CREATE STREAM TICKER (
  room_id VARCHAR KEY,
  site_id VARCHAR,
  now_ms BIGINT
) WITH (
  KAFKA_TOPIC='iot.ticker',
  VALUE_FORMAT='JSON'
);

-- ===== 派生：motion/door =====
-- motion：把 ISO ts → 毫秒（注意格式字符串里 T 要写成 ''T''）
CREATE STREAM MOTION_RAW WITH (KAFKA_TOPIC='iot.motion.raw', PARTITIONS=1) AS
SELECT
  room_id,
  STRINGTOTIMESTAMP(ts, 'yyyy-MM-dd''T''HH:mm:ssX') AS ts_ms
FROM TELEMETRY
WHERE type = 'sensor.motion' AND motion_active = TRUE
EMIT CHANGES;

-- door：最近门状态
CREATE STREAM DOOR_RAW WITH (KAFKA_TOPIC='iot.door.raw', PARTITIONS=1) AS
SELECT
  room_id,
  IFNULL(door_closed, FALSE) AS door_closed
FROM TELEMETRY
WHERE type = 'sensor.door'
EMIT CHANGES;

-- ===== 状态表 =====
CREATE TABLE LAST_MOTION AS
SELECT room_id, LATEST_BY_OFFSET(ts_ms) AS last_motion_ms
FROM MOTION_RAW
GROUP BY room_id
EMIT CHANGES;

CREATE TABLE DOOR_STATE AS
SELECT room_id, LATEST_BY_OFFSET(door_closed) AS door_closed
FROM DOOR_RAW
GROUP BY room_id
EMIT CHANGES;

-- ===== 规则前置（CR-101 ~ CR-105，对应 R01-R05）=====
CREATE STREAM AFTER_HOURS_EVAL WITH (KAFKA_TOPIC='iot.afterhours.eval', PARTITIONS=1) AS
SELECT
  T.room_id AS room_id,
  T.site_id AS site_id,
  L.last_motion_ms AS last_motion_ms,
  D.door_closed AS door_closed,
  T.now_ms AS now_ms,
  CASE
    WHEN T.room_id = 'CR-101' THEN 10
    WHEN T.room_id = 'CR-102' THEN 12
    WHEN T.room_id = 'CR-103' THEN 8
    WHEN T.room_id = 'CR-104' THEN 10
    WHEN T.room_id = 'CR-105' THEN 10
    ELSE 9999
  END AS threshold_min,
  CASE
    WHEN T.room_id = 'CR-101' THEN 'R01'
    WHEN T.room_id = 'CR-102' THEN 'R02'
    WHEN T.room_id = 'CR-103' THEN 'R03'
    WHEN T.room_id = 'CR-104' THEN 'R04'
    WHEN T.room_id = 'CR-105' THEN 'R05'
    ELSE 'R00'
  END AS rule_id
FROM TICKER T
LEFT JOIN LAST_MOTION L ON T.room_id = L.room_id
LEFT JOIN DOOR_STATE  D ON T.room_id = D.room_id
WHERE T.room_id IN ('CR-101','CR-102','CR-103','CR-104','CR-105')
EMIT CHANGES;

-- ===== 触发条件 =====
-- 18:00 判定用算术：((now_ms / 3600000) % 24) >= 18
CREATE STREAM TRIGGERS WITH (KAFKA_TOPIC='iot.afterhours.triggers', PARTITIONS=1) AS
SELECT
  room_id,
  site_id,
  last_motion_ms,
  now_ms,
  door_closed,
  (now_ms - last_motion_ms) AS idle_ms,
  threshold_min,
  rule_id
FROM AFTER_HOURS_EVAL
WHERE door_closed = TRUE
  AND last_motion_ms IS NOT NULL
  AND ((now_ms / 3600000) % 24) >= 18
  AND (now_ms - last_motion_ms) >= (threshold_min * 60 * 1000)
EMIT CHANGES;

-- ===== 输出命令到 iot.commands =====
-- 为了最大兼容性：args 用 STRING，直接放 JSON 文本
CREATE STREAM IOT_COMMANDS (
  room_id VARCHAR KEY,
  site_id VARCHAR,
  device_id VARCHAR,
  cmd VARCHAR,
  args STRING,
  corr_id VARCHAR,
  ts STRING
) WITH (
  KAFKA_TOPIC='iot.commands',
  VALUE_FORMAT='JSON',
  PARTITIONS=1
);

CREATE STREAM IOT_ALERTS (
  rule STRING,
  roomId STRING,
  action STRING,
  temp DOUBLE,
  rise DOUBLE,
  msg STRING,
  ts BIGINT
) WITH (
  KAFKA_TOPIC='iot.alerts',
  VALUE_FORMAT='JSON',
  PARTITIONS=1
);

-- 灯光命令（OFF/0）
INSERT INTO IOT_COMMANDS
SELECT
  room_id,
  site_id,
  'LIGHT' AS device_id,
  'switch' AS cmd,
  CASE
    WHEN rule_id = 'R05' THEN '{"cmd":"DIM","target":0,"duration":30}'
    ELSE '{"cmd":"OFF","level":0}'
  END AS args,
  '' AS corr_id,
  CAST(now_ms AS STRING) AS ts
FROM TRIGGERS
EMIT CHANGES;

-- HVAC 命令（ECO/24.0）
INSERT INTO IOT_COMMANDS
SELECT
  room_id,
  site_id,
  'HVAC' AS device_id,
  'switch' AS cmd,
  '{"cmd":"ECO","setpoint":24.0}' AS args,
  '' AS corr_id,
  CAST(now_ms AS STRING) AS ts
FROM TRIGGERS
EMIT CHANGES;

INSERT INTO IOT_ALERTS
SELECT
  rule_id AS rule,
  room_id AS roomId,
  CASE
    WHEN rule_id = 'R05' THEN 'LIGHTS_DIM_TO_ZERO + HVAC_ECO'
    ELSE 'LIGHTS_OFF + HVAC_ECO'
  END AS action,
  CAST(NULL AS DOUBLE) AS temp,
  CAST(NULL AS DOUBLE) AS rise,
  'After-hours auto-off rule triggered' AS msg,
  now_ms AS ts
FROM TRIGGERS
EMIT CHANGES;
