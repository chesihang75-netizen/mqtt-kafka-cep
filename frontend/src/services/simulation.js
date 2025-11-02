import { ROOMS } from './ruleEngine';

const MINUTE = 60 * 1000;
const DEFAULT_DOOR_STATE = {
  'CR-101': 'CLOSED',
  'CR-102': 'CLOSED',
  'CR-103': 'CLOSED',
  'CR-104': 'CLOSED',
  'CR-105': 'CLOSED',
};

const AFTER_HOURS_RULES = {
  R01: { minutes: 10 },
  R02: { minutes: 12 },
  R03: { minutes: 8 },
  R04: { minutes: 10 },
  R05: { minutes: 10 },
};

const CO2_RULES = {
  R06: { threshold: 1000, minutes: 5 },
  R07: { threshold: 950, minutes: 5 },
  R08: { threshold: 1100, minutes: 3 },
  R09: { threshold: 1000, minutes: 5 },
  R10: { threshold: 900, minutes: 7 },
};

const TEMP_RULES = {
  R11: { comparator: '>', threshold: 26, minutes: 10, motionRequired: true },
  R12: { comparator: '<', threshold: 20, minutes: 10, motionRequired: true },
  R13: { comparator: '>', threshold: 27, minutes: 5, motionRequired: true },
};

const SIM_TIME_SCALE = (() => {
  const raw = import.meta.env?.VITE_SIM_TIME_SCALE;
  const parsed = Number.parseFloat(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 1;
})();

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normaliseDoorState(value) {
  if (typeof value === 'string') {
    return value.toUpperCase();
  }
  return value || 'CLOSED';
}

export default function createSimulation({ rules, onAlert, onSensor }) {
  const sensorState = new Map();
  const roomContexts = new Map();
  const rulesByRoom = new Map();
  const trackers = new Map();

  const simulationStartReal = Date.now();
  const simulationStartVirtual = Date.now();

  let sensorTimer = null;

  ROOMS.forEach((roomId) => {
    roomContexts.set(roomId, {
      motionFalseSince: null,
      lastMotionDetected: simulationStartVirtual,
      doorState: DEFAULT_DOOR_STATE[roomId] || 'CLOSED',
      temperatureHistory: [],
      lastActionLightsOff: false,
    });
  });

  rules.forEach((rule) => {
    if (!rulesByRoom.has(rule.room)) {
      rulesByRoom.set(rule.room, []);
    }
    rulesByRoom.get(rule.room).push(rule);
    trackers.set(rule.id, {
      armed: true,
      conditionSince: null,
      lastTriggeredAt: 0,
    });
  });

  function nowMs() {
    if (SIM_TIME_SCALE === 1) {
      return Date.now();
    }
    const elapsed = Date.now() - simulationStartReal;
    return simulationStartVirtual + elapsed * SIM_TIME_SCALE;
  }

  function buildSensorPayload(roomId, referenceTime) {
    const previous = sensorState.get(roomId) || {
      roomId,
      co2: randomBetween(420, 620),
      temperature: randomBetween(21.5, 24.5),
      motion: Math.random() > 0.45,
      lux: randomBetween(180, 420),
      doorState: DEFAULT_DOOR_STATE[roomId] || 'CLOSED',
    };

    const context = roomContexts.get(roomId);

    const next = {
      roomId,
      co2: clamp(previous.co2 + randomBetween(-30, 45), 350, 1600),
      temperature: clamp(previous.temperature + randomBetween(-0.18, 0.22), 18, 30),
      motion:
        Math.random() < 0.15
          ? !previous.motion
          : previous.motion,
      lux: clamp(previous.lux + randomBetween(-55, 65), 10, 1000),
      doorState:
        Math.random() < 0.05
          ? normaliseDoorState(previous.doorState === 'CLOSED' ? 'OPEN' : 'CLOSED')
          : normaliseDoorState(previous.doorState),
    };

    // Encourage thresholds occasionally to keep the simulator lively while still rule-accurate
    if (Math.random() < 0.08) {
      next.co2 = clamp(next.co2 + randomBetween(120, 320), 350, 1600);
    }
    if (Math.random() < 0.06) {
      next.temperature = clamp(next.temperature + randomBetween(0.8, 2.4), 18, 30);
    }

    // If lights are off we nudge lux downward to reflect the darker room
    if (context?.lastActionLightsOff) {
      next.lux = clamp(next.lux - randomBetween(25, 60), 10, 1000);
    }

    const timestamp = new Date(referenceTime).toISOString();

    const payload = {
      ...next,
      timestamp,
    };

    sensorState.set(roomId, payload);
    return payload;
  }

  function updateContext(roomId, sensor, timestampMs) {
    const context = roomContexts.get(roomId);
    if (!context) return;

    if (sensor.motion) {
      context.lastMotionDetected = timestampMs;
      context.motionFalseSince = null;
    } else if (!context.motionFalseSince) {
      context.motionFalseSince = timestampMs;
    }

    context.doorState = normaliseDoorState(sensor.doorState || context.doorState);

    context.temperatureHistory.push({ time: timestampMs, value: sensor.temperature });
    while (
      context.temperatureHistory.length > 0 &&
      timestampMs - context.temperatureHistory[0].time > 20 * MINUTE
    ) {
      context.temperatureHistory.shift();
    }
  }

  function triggerRule(rule, sensor, tracker, triggeredAtMs) {
    tracker.armed = false;
    tracker.conditionSince = null;
    tracker.lastTriggeredAt = triggeredAtMs;

    const message = {
      roomId: rule.room,
      ruleId: rule.id,
      ruleName: rule.category,
      summary: rule.description,
      triggeredAt: new Date(triggeredAtMs).toISOString(),
      changes: { ...rule.changes },
      telemetry: {
        co2: sensor.co2,
        temperature: sensor.temperature,
        motion: sensor.motion,
        lux: sensor.lux,
        doorState: sensor.doorState,
      },
    };

    if (rule.id === 'R05') {
      message.changes.dimDuration = rule.changes?.dimDuration ?? 30;
    }

    if (rule.id.startsWith('R0') && rule.id <= 'R05') {
      const context = roomContexts.get(rule.room);
      if (context) {
        context.lastActionLightsOff = true;
      }
    }

    if (rule.changes?.hvac === 'BOOST') {
      const current = sensorState.get(rule.room);
      if (current) {
        current.co2 = clamp(current.co2 - randomBetween(40, 90), 350, 1600);
      }
    }

    onAlert(message);
  }

  function evaluateAfterHours(rule, sensor, tracker, context, nowDate, nowMs) {
    const requirement = AFTER_HOURS_RULES[rule.id];
    if (!requirement) return;

    const afterHours = nowDate.getHours() >= 18;
    const doorClosed = context.doorState === 'CLOSED';

    if (afterHours && !sensor.motion && doorClosed && context.motionFalseSince) {
      const duration = nowMs - context.motionFalseSince;
      tracker.conditionSince = context.motionFalseSince;
      if (duration >= requirement.minutes * MINUTE && tracker.armed) {
        triggerRule(rule, sensor, tracker, nowMs);
      }
    } else {
      tracker.conditionSince = null;
      tracker.armed = true;
      if (context) {
        context.lastActionLightsOff = false;
      }
    }
  }

  function evaluateCo2(rule, sensor, tracker, nowMs) {
    const cfg = CO2_RULES[rule.id];
    if (!cfg) return;

    if (sensor.motion && sensor.co2 > cfg.threshold) {
      if (!tracker.conditionSince) {
        tracker.conditionSince = nowMs;
      }
      if (nowMs - tracker.conditionSince >= cfg.minutes * MINUTE && tracker.armed) {
        triggerRule(rule, sensor, tracker, nowMs);
      }
    } else {
      tracker.conditionSince = null;
      tracker.armed = true;
    }
  }

  function evaluateTempThreshold(rule, sensor, tracker, nowMs) {
    const cfg = TEMP_RULES[rule.id];
    if (!cfg) return;

    const comparison = cfg.comparator === '>'
      ? sensor.temperature > cfg.threshold
      : sensor.temperature < cfg.threshold;

    const motionOk = !cfg.motionRequired || sensor.motion;

    if (comparison && motionOk) {
      if (!tracker.conditionSince) {
        tracker.conditionSince = nowMs;
      }
      if (nowMs - tracker.conditionSince >= cfg.minutes * MINUTE && tracker.armed) {
        triggerRule(rule, sensor, tracker, nowMs);
      }
    } else {
      tracker.conditionSince = null;
      tracker.armed = true;
    }
  }

  function evaluateTempRising(rule, sensor, tracker, context, nowMs) {
    const tenMinutesAgo = nowMs - 10 * MINUTE;
    const history = context.temperatureHistory;
    if (!history.length) {
      tracker.armed = true;
      return;
    }

    let reference = null;
    for (let i = 0; i < history.length; i += 1) {
      if (history[i].time <= tenMinutesAgo) {
        reference = history[i];
      } else {
        break;
      }
    }

    const oldest = reference || history[0];
    const rise = sensor.temperature - oldest.value;

    if (sensor.motion && rise > 2 && nowMs - oldest.time <= 10 * MINUTE) {
      if (tracker.armed) {
        triggerRule(rule, sensor, tracker, nowMs);
      }
    } else {
      tracker.armed = true;
    }
  }

  function evaluateTempAndCo2(rule, sensor, tracker, nowMs) {
    const tempHigh = sensor.temperature > 25;
    const co2High = sensor.co2 > 1000;

    if (tempHigh && co2High) {
      if (!tracker.conditionSince) {
        tracker.conditionSince = nowMs;
      }
      if (nowMs - tracker.conditionSince >= 15 * MINUTE && tracker.armed) {
        triggerRule(rule, sensor, tracker, nowMs);
      }
    } else {
      tracker.conditionSince = null;
      tracker.armed = true;
    }
  }

  function evaluateRulesForRoom(roomId, sensor, timestampMs) {
    const roomRules = rulesByRoom.get(roomId);
    if (!roomRules) return;

    const context = roomContexts.get(roomId);
    const nowDate = new Date(timestampMs);

    roomRules.forEach((rule) => {
      const tracker = trackers.get(rule.id);
      if (!tracker) return;

      switch (rule.id) {
        case 'R01':
        case 'R02':
        case 'R03':
        case 'R04':
        case 'R05':
          evaluateAfterHours(rule, sensor, tracker, context, nowDate, timestampMs);
          break;
        case 'R06':
        case 'R07':
        case 'R08':
        case 'R09':
        case 'R10':
          evaluateCo2(rule, sensor, tracker, timestampMs);
          break;
        case 'R11':
        case 'R12':
        case 'R13':
          evaluateTempThreshold(rule, sensor, tracker, timestampMs);
          break;
        case 'R14':
          evaluateTempRising(rule, sensor, tracker, context, timestampMs);
          break;
        case 'R15':
          evaluateTempAndCo2(rule, sensor, tracker, timestampMs);
          break;
        default:
          break;
      }
    });
  }

  function broadcastSensors() {
    const currentTime = nowMs();
    ROOMS.forEach((roomId) => {
      const payload = buildSensorPayload(roomId, currentTime);
      updateContext(roomId, payload, currentTime);
      onSensor(payload);
      evaluateRulesForRoom(roomId, payload, currentTime);
    });
  }

  return {
    start() {
      if (sensorTimer) return;
      broadcastSensors();
      sensorTimer = setInterval(broadcastSensors, 4000);
    },
    stop() {
      if (!sensorTimer) return;
      clearInterval(sensorTimer);
      sensorTimer = null;
    },
  };
}
