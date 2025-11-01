const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const { Kafka, logLevel } = require('kafkajs');
const crypto = require('crypto');

const PORT = parseInt(process.env.WS_PORT || '8090', 10);
const TOPIC = process.env.KAFKA_TOPIC || 'iot.alerts';
const GROUP_ID = process.env.KAFKA_GROUP_ID || 'iot-alert-bridge';
const BROKERS = (process.env.KAFKA_BROKERS || 'kafka:9093')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
const BUFFER_SIZE = parseInt(process.env.BRIDGE_BUFFER_SIZE || '200', 10);
const FROM_BEGINNING = process.env.KAFKA_FROM_BEGINNING === 'true';

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'iot-alert-websocket',
  brokers: BROKERS,
  logLevel: logLevel.INFO,
});

const consumer = kafka.consumer({
  groupId: GROUP_ID,
  allowAutoTopicCreation: true,
});

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, path: '/ws/actions' });

const recentOrder = [];
const recentMap = new Map();

const randomId = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');

const fingerprint = (payload) => {
  try {
    const json = JSON.stringify(payload);
    return crypto.createHash('sha1').update(json).digest('hex');
  } catch (error) {
    return null;
  }
};

const unwrapValue = (value) => {
  if (value == null) {
    return null;
  }

  if (Buffer.isBuffer(value)) {
    return unwrapValue(value.toString('utf8'));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return {};
    }
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      return { message: value };
    }
  }

  if (typeof value === 'object') {
    if (value.payload !== undefined) {
      return unwrapValue(value.payload);
    }
    if (value.data !== undefined) {
      return unwrapValue(value.data);
    }
    if (value.value !== undefined) {
      return unwrapValue(value.value);
    }
    return value;
  }

  return { message: value };
};

const normalizePayload = (message) => {
  if (!message) {
    return {};
  }

  const decoded = unwrapValue(message.value ?? message.content ?? message.payload ?? message);
  return decoded || {};
};

const buildRecord = ({ message, partition }) => {
  const parsed = normalizePayload(message);
  const raw = parsed && typeof parsed === 'object' ? parsed : { message: parsed };
  const body = { ...raw };
  const receivedAt = new Date().toISOString();
  const fp = body.fingerprint || fingerprint(body);
  const id =
    body.id ||
    (typeof message.offset !== 'undefined' ? `${partition}-${message.offset}` : randomId());

  return {
    ...body,
    fingerprint: fp || id,
    id,
    raw,
    kafkaTopic: message.topic,
    kafkaPartition: partition,
    kafkaOffset: message.offset,
    kafkaTimestamp: message.timestamp,
    receivedAt,
  };
};

const storeRecord = (record) => {
  const key = record.fingerprint || record.id;
  if (!key) {
    return;
  }

  if (!recentMap.has(key)) {
    recentOrder.push(key);
    if (recentOrder.length > BUFFER_SIZE) {
      const oldestKey = recentOrder.shift();
      if (oldestKey) {
        recentMap.delete(oldestKey);
      }
    }
  }

  recentMap.set(key, record);
};

const broadcast = (payload) => {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
};

wss.on('connection', (socket) => {
  const snapshot = Array.from(recentMap.values()).sort((a, b) => {
    const left = new Date(a.kafkaTimestamp || a.timestamp || a.receivedAt).getTime();
    const right = new Date(b.kafkaTimestamp || b.timestamp || b.receivedAt).getTime();
    return right - left;
  });

  if (snapshot.length > 0) {
    socket.send(JSON.stringify(snapshot));
  }

  socket.on('error', (error) => {
    console.error('WebSocket error', error.message);
  });
});

const start = async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: FROM_BEGINNING });

  await consumer.run({
    eachMessage: async ({ message, partition }) => {
      try {
        const record = buildRecord({ message, partition });
        storeRecord(record);
        broadcast(record);
      } catch (error) {
        console.error('Failed to process Kafka message', error);
      }
    },
  });

  server.listen(PORT, () => {
    console.log(`Kafka WebSocket bridge listening on ${PORT}, streaming topic ${TOPIC}`);
  });
};

start().catch((error) => {
  console.error('Failed to start Kafka WebSocket bridge', error);
  process.exit(1);
});

const shutdown = async () => {
  try {
    await consumer.disconnect();
  } catch (error) {
    console.error('Error disconnecting Kafka consumer', error);
  }
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
