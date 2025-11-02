import rules from './rules';

const ruleMap = new Map(rules.map((rule) => [rule.id, rule]));

function parseTimestamp(value) {
  if (value == null) return new Date().toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1e12) return new Date(value).toISOString();
    if (value > 1e9) return new Date(value * 1000).toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return parseTimestamp(numeric);
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric;
  }
  return undefined;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    if (!normalised) return undefined;
    return ['true', '1', 'yes', 'y', 'on', 'active'].includes(normalised);
  }
  return undefined;
}

function normaliseAlert(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const roomId = payload.roomId || payload.room_id;
  const ruleId = payload.rule || payload.ruleId;
  if (!roomId || !ruleId) return null;

  const rule = ruleMap.get(ruleId);

  let changes;
  if (payload.changes && typeof payload.changes === 'object' && !Array.isArray(payload.changes)) {
    changes = { ...payload.changes };
  } else if (rule?.changes) {
    changes = { ...rule.changes };
  } else {
    changes = undefined;
  }

  if (payload.action) {
    switch (payload.action) {
      case 'HVAC_BOOST':
        changes = { ...(changes || {}), hvac: 'BOOST' };
        break;
      case 'SETPOINT_DEC':
        changes = { ...(changes || {}), setpointDelta: -1 };
        break;
      case 'SETPOINT_INC':
        changes = { ...(changes || {}), setpointDelta: 1 };
        break;
      case 'BOOST_ALERT':
        changes = { ...(changes || {}), hvac: 'BOOST', alert: changes?.alert || 'stuffy room' };
        break;
      case 'ALERT_HVAC_CHECK':
        changes = { ...(changes || {}), alert: changes?.alert || 'HVAC check' };
        break;
      default:
        break;
    }
  }

  return {
    roomId,
    ruleId,
    ruleName: payload.ruleName || rule?.category,
    summary: payload.msg || payload.summary || rule?.description,
    triggeredAt: parseTimestamp(payload.ts ?? payload.triggeredAt ?? payload.timestamp),
    changes,
  };
}

function normaliseSensor(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const roomId = payload.roomId || payload.room_id;
  if (!roomId) return null;

  const temperature = toNumber(payload.temp) ?? toNumber(payload.temperature);

  const co2 = toNumber(payload.co2) ?? toNumber(payload.CO2);

  const motion = toBoolean(payload.motion ?? payload.motion_active ?? payload.motionActive);

  let lux;
  const luxValue = toNumber(payload.lux) ?? toNumber(payload.light) ?? toNumber(payload.lightLevel);
  if (Number.isFinite(luxValue)) {
    lux = luxValue;
  }

  let doorState = payload.doorState || payload.door_state;
  if (!doorState && typeof payload.door_closed === 'boolean') {
    doorState = payload.door_closed ? 'CLOSED' : 'OPEN';
  }

  return {
    roomId,
    temperature,
    co2,
    motion,
    lux,
    doorState: typeof doorState === 'string' ? doorState.toUpperCase() : doorState,
    timestamp: parseTimestamp(payload.ts ?? payload.timestamp ?? payload.time ?? payload.ingestedAt),
  };
}

function createSource(url, normalise, onMessage, onStatusChange, key) {
  if (!url || typeof EventSource === 'undefined') {
    return null;
  }

  let connected = false;
  const source = new EventSource(url);

  source.onopen = () => {
    connected = true;
    onStatusChange?.(key, true);
  };

  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const normalised = normalise(data);
      if (normalised) {
        onMessage(normalised);
      }
    } catch (error) {
      console.error(`Failed to parse event from ${url}`, error);
    }
  };

  source.onerror = (event) => {
    console.warn(`EventSource connection lost for ${url}`, event);
    onStatusChange?.(key, false);
    connected = false;
  };

  return source;
}

export default function createKafkaBridge({ onAlert, onSensor, onStatusChange } = {}) {
  const base = (import.meta.env.VITE_KAFKA_BRIDGE_BASE_URL || '').replace(/\/?$/, '');
  const alertsUrl = import.meta.env.VITE_ALERTS_STREAM_URL || (base ? `${base}/stream/alerts` : '');
  const sensorsUrl = import.meta.env.VITE_SENSORS_STREAM_URL || (base ? `${base}/stream/input` : '');

  let alertSource = null;
  let sensorSource = null;

  return {
    start() {
      let started = false;
      if (alertsUrl && typeof onAlert === 'function') {
        alertSource = createSource(alertsUrl, normaliseAlert, onAlert, onStatusChange, 'alerts');
        if (alertSource) {
          started = true;
        }
      }
      if (sensorsUrl && typeof onSensor === 'function') {
        sensorSource = createSource(sensorsUrl, normaliseSensor, onSensor, onStatusChange, 'sensors');
        if (sensorSource) {
          started = true;
        }
      }
      return started;
    },
    stop() {
      if (alertSource) {
        alertSource.close();
        onStatusChange?.('alerts', false);
        alertSource = null;
      }
      if (sensorSource) {
        sensorSource.close();
        onStatusChange?.('sensors', false);
        sensorSource = null;
      }
    },
  };
}
