import cors from 'cors';
import express from 'express';
import { Kafka, logLevel } from 'kafkajs';

const port = Number(process.env.PORT || process.env.KAFKA_BRIDGE_PORT || 5175);
const brokerList = (process.env.KAFKA_BROKERS || 'localhost:9092')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

if (!brokerList.length) {
  console.error('No Kafka brokers configured. Set KAFKA_BROKERS to a comma separated list.');
  process.exit(1);
}

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'iot-dashboard-bridge',
  brokers: brokerList,
  logLevel: logLevel.NOTHING,
});

const alertTopic = process.env.KAFKA_ALERT_TOPIC || 'iot.alerts';
const sensorTopic = process.env.KAFKA_SENSOR_TOPIC || 'iot.input';
const fromBeginning = process.env.KAFKA_FROM_BEGINNING === 'true';

const alertConsumer = kafka.consumer({ groupId: process.env.KAFKA_ALERT_GROUP || 'iot-dashboard-alerts' });
const sensorConsumer = kafka.consumer({ groupId: process.env.KAFKA_SENSOR_GROUP || 'iot-dashboard-sensors' });

const alertClients = new Set();
const sensorClients = new Set();

function setupSse(req, res, clientSet) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');

  clientSet.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (error) {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clientSet.delete(res);
  });
}

function broadcast(clients, payload) {
  const message = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of [...clients]) {
    try {
      client.write(message);
    } catch (error) {
      clients.delete(client);
    }
  }
}

async function startConsumer(consumer, topic, clients) {
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning });
  consumer
    .run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        try {
          const json = JSON.parse(message.value.toString());
          broadcast(clients, json);
        } catch (error) {
          console.error(`Failed to parse message from ${topic}:`, error);
        }
      },
    })
    .catch((error) => {
      console.error(`Kafka consumer for ${topic} stopped`, error);
    });
}

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean) || true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/stream/alerts', (req, res) => {
  setupSse(req, res, alertClients);
});

app.get('/stream/input', (req, res) => {
  setupSse(req, res, sensorClients);
});

app.listen(port, () => {
  console.log(`Kafka bridge listening on ${port}`);
});

Promise.all([
  startConsumer(alertConsumer, alertTopic, alertClients),
  startConsumer(sensorConsumer, sensorTopic, sensorClients),
]).catch((error) => {
  console.error('Failed to initialise Kafka bridge consumers:', error);
  process.exit(1);
});

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
