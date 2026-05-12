import cors from 'cors';
import express from 'express';
import { Kafka, logLevel } from 'kafkajs';

// ======== 环境变量配置 ========
const port = Number(process.env.PORT || process.env.KAFKA_BRIDGE_PORT || 5175);
const brokerList = (process.env.KAFKA_BROKERS || 'localhost:9092')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

if (!brokerList.length) {
  console.error('❌ No Kafka brokers configured. Set KAFKA_BROKERS to a comma separated list.');
  process.exit(1);
}

console.log('🟢 Express app starting on port', port);
console.log('🟡 Kafka brokers:', brokerList.join(', '));

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'iot-dashboard-bridge',
  brokers: brokerList,
  logLevel: logLevel.NOTHING,
});

const alertTopic   = process.env.KAFKA_ALERT_TOPIC  || 'iot.alerts';
const sensorTopic  = process.env.KAFKA_SENSOR_TOPIC || 'iot.input';
const fromBeginning = process.env.KAFKA_FROM_BEGINNING === 'true';

const alertConsumer  = kafka.consumer({ groupId: process.env.KAFKA_ALERT_GROUP  || 'iot-dashboard-alerts'  });
const sensorConsumer = kafka.consumer({ groupId: process.env.KAFKA_SENSOR_GROUP || 'iot-dashboard-sensors' });

const alertClients  = new Set();
const sensorClients = new Set();

// ======== SSE 客户端处理 ========
function setupSse(req, res, clientSet) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  clientSet.add(res);

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clientSet.delete(res);
  });
}

// ======== 广播到前端 ========
function broadcast(clients, payload) {
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of [...clients]) {
    try { client.write(message); } catch { clients.delete(client); }
  }
}

// ======== 核心消费逻辑 ========
async function startConsumer(consumer, topic, clients) {
  console.log('🟡 Connecting Kafka consumer for topic:', topic);
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning });
  consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        const json = JSON.parse(message.value.toString());
        const payload = json.event || json;
        broadcast(clients, payload);
      } catch (err) {
        console.error(`❌ Failed to parse message from ${topic}:`, err);
      }
    },
  }).catch((err) => {
    console.error(`❌ Kafka consumer for ${topic} stopped`, err);
  });
}

// ======== Express 服务部分 ========
const app = express();
app.use(cors({
  origin: (process.env.CORS_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean)) || true
}));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/stream/alerts', (req, res) => setupSse(req, res, alertClients));
app.get('/stream/input',  (req, res) => setupSse(req, res, sensorClients));

app.listen(port, () => {
  console.log(`✅ Kafka bridge listening on port ${port}`);
});

Promise.all([
  startConsumer(alertConsumer,  alertTopic,  alertClients),
  startConsumer(sensorConsumer, sensorTopic, sensorClients),
]).catch((err) => {
  console.error('⚠️  Failed to initialise Kafka bridge consumers (Kafka may be unreachable):', err);
  console.warn('SSE server will continue listening on port 5175.');
});

// ======== 优雅退出 ========
async function shutdown() {
  console.log('Shutting down Kafka bridge...');
  await Promise.allSettled([
    alertConsumer.disconnect(),
    sensorConsumer.disconnect(),
  ]);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
