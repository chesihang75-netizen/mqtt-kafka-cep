// src/index.js  (Node >=16, CommonJS)
const http = require('http');
const { WebSocketServer } = require('ws');
const { Kafka } = require('kafkajs');
const { parse } = require('url');

// 先读环境变量，未设置则用默认值（主机直连本机 Kafka）
const PORT    = Number(process.env.WS_PORT) || 8090;
const WS_PATH = process.env.WS_PATH || '/ws/actions';
const TOPIC   = process.env.KAFKA_TOPIC || 'iot.alerts';
const BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// ----- HTTP server（含 /health），同端口升级为 WS -----
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {'Content-Type':'text/plain'}); res.end('OK');
  } else {
    res.writeHead(404); res.end('Not Found');
  }
});
server.listen(PORT, () =>
  console.log(`HTTP/WS listening on http://localhost:${PORT} (WS ${WS_PATH})`)
);

// ----- 仅允许指定路径的 WebSocket -----
const wss = new WebSocketServer({ noServer: true });
const clients = new Set();

server.on('upgrade', (req, socket, head) => {
  const { pathname } = parse(req.url);
  if (pathname !== WS_PATH) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n'); socket.destroy(); return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', e => console.error('WS client error:', e.message));
  ws.send(JSON.stringify({ type: 'hello', msg: 'connected to ws-bridge' }));
});

// ----- Kafka consumer → 广播到所有 WS 客户端 -----
(async () => {
  const kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || 'ws-bridge',
    brokers: BROKERS,
  });

  const consumer = kafka.consumer({
    groupId: process.env.KAFKA_GROUP_ID || 'ws-bridge-group',
  });

  await consumer.connect();
  console.log('Kafka connected ->', BROKERS.join(', '));

  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });
  console.log(`Subscribed topic: ${TOPIC}`);

  await consumer.run({
    eachMessage: async ({ message }) => {
      const payload = message.value ? message.value.toString() : '';
      for (const ws of clients) {
        try { ws.send(payload); } catch {}
      }
    }
  });
})().catch(err => {
  console.error('Kafka error:', err);
  process.exit(1);
});
