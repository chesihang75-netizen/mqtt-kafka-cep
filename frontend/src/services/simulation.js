import { ROOMS } from './ruleEngine';

const defaultDoorState = {
  'CR-101': 'CLOSED',
  'CR-102': 'CLOSED',
  'CR-103': 'CLOSED',
  'CR-104': 'CLOSED',
  'CR-105': 'CLOSED',
};

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function pick(array) {
  return array[Math.floor(Math.random() * array.length)];
}

export default function createSimulation({ rules, onAlert, onSensor }) {
  let sensorTimer = null;
  let actionTimer = null;
  const sensorState = new Map();

  const doorState = { ...defaultDoorState };

  function broadcastSensors() {
    ROOMS.forEach((roomId) => {
      const previous = sensorState.get(roomId) || {
        co2: randomBetween(420, 650),
        temperature: randomBetween(21, 24),
        motion: Math.random() > 0.5,
        lux: randomBetween(150, 420),
      };

      const variation = {
        co2: previous.co2 + randomBetween(-35, 45),
        temperature: previous.temperature + randomBetween(-0.2, 0.3),
        motion: Math.random() > 0.6 ? !previous.motion : previous.motion,
        lux: Math.max(10, previous.lux + randomBetween(-60, 70)),
      };

      const payload = {
        roomId,
        co2: Math.max(350, Math.min(1600, variation.co2)),
        temperature: Math.max(18, Math.min(30, variation.temperature)),
        motion: variation.motion,
        lux: Math.round(variation.lux),
        timestamp: new Date().toISOString(),
        doorState: doorState[roomId],
      };

      sensorState.set(roomId, payload);
      onSensor(payload);
    });
  }

  function broadcastAction() {
    const rule = pick(rules);
    const roomId = rule.room;
    const now = new Date();
    const sensor = sensorState.get(roomId);
    const message = {
      roomId,
      ruleId: rule.id,
      ruleName: rule.category,
      summary: rule.description,
      triggeredAt: now.toISOString(),
      changes: { ...rule.changes },
    };

    if (rule.id.startsWith('R0') && rule.id <= 'R05') {
      // After-hours rules imply lights off and door closed
      message.changes.lights = 'OFF';
      message.changes.hvac = 'ECO';
      doorState[roomId] = 'CLOSED';
      if (sensor) {
        sensor.motion = false;
        sensor.lux = Math.max(10, sensor.lux - 60);
      }
    }

    if (message.changes?.door) {
      doorState[roomId] = message.changes.door;
    }

    if (message.changes?.hvac === 'BOOST') {
      if (sensor) {
        sensor.co2 = Math.max(450, sensor.co2 - 80);
      }
    }

    if (sensor) {
      message.telemetry = {
        co2: sensor.co2,
        temperature: sensor.temperature,
        motion: sensor.motion,
        lux: sensor.lux,
        doorState: doorState[roomId],
      };
    }

    onAlert(message);
  }

  return {
    start() {
      if (!sensorTimer) {
        broadcastSensors();
        sensorTimer = setInterval(broadcastSensors, 4000);
      }
      if (!actionTimer) {
        actionTimer = setInterval(broadcastAction, 6500);
      }
    },
    stop() {
      if (sensorTimer) {
        clearInterval(sensorTimer);
        sensorTimer = null;
      }
      if (actionTimer) {
        clearInterval(actionTimer);
        actionTimer = null;
      }
    },
  };
}
