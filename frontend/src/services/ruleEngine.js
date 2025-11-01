import rules from './rules';

export const ROOMS = ['CR-101', 'CR-102', 'CR-103', 'CR-104', 'CR-105'];

export function createInitialRoomState(roomId) {
  return {
    roomId,
    lights: 'ON',
    lightLevel: 100,
    door: 'CLOSED',
    hvac: 'ECO',
    setpoint: 23,
    lastRule: '',
    updatedAt: null,
  };
}

export function createInitialSensorState(roomId) {
  return {
    roomId,
    co2: 520,
    temperature: 23,
    motion: false,
    lux: 320,
    updatedAt: null,
  };
}

const ruleMap = rules.reduce((acc, rule) => {
  acc[rule.id] = rule;
  return acc;
}, {});

export function applyAlert(roomState, alert) {
  const rule = ruleMap[alert.ruleId];
  const changes = alert.changes || (rule ? rule.changes : {});

  if (changes?.lights) {
    roomState.lights = changes.lights;
    if (changes.lights === 'OFF') {
      roomState.lightLevel = 0;
    } else if (changes.lights === 'ON') {
      roomState.lightLevel = 100;
    }
  }

  if (typeof changes?.dimTo === 'number') {
    roomState.lights = changes.dimTo === 0 ? 'OFF' : 'ON';
  }

  if (changes?.hvac) {
    roomState.hvac = changes.hvac;
  }

  if (typeof changes?.setpoint === 'number') {
    roomState.setpoint = changes.setpoint;
  }

  if (typeof changes?.setpointDelta === 'number') {
    const min = changes.minSetpoint ?? 18;
    const max = changes.maxSetpoint ?? 26;
    const next = (roomState.setpoint ?? 23) + changes.setpointDelta;
    roomState.setpoint = Math.min(max, Math.max(min, next));
  }

  if (changes?.door) {
    roomState.door = changes.door;
  }

  roomState.lastRule = `${alert.ruleId} · ${alert.ruleName || rule?.category || ''}`.trim();
  roomState.updatedAt = alert.triggeredAt || new Date().toISOString();
}

export function summariseAlert(alert) {
  const rule = ruleMap[alert.ruleId];
  const changes = alert.changes || (rule ? rule.changes : {});

  const changeList = [];
  if (changes?.lights) changeList.push(`Lights → ${changes.lights}`);
  if (typeof changes?.dimTo === 'number') changeList.push(`Dim to ${changes.dimTo}% (${changes.dimDuration ?? 0}s)`);
  if (changes?.hvac) changeList.push(`HVAC → ${changes.hvac}`);
  if (typeof changes?.setpointDelta === 'number') changeList.push(`Setpoint ${changes.setpointDelta > 0 ? '+' : ''}${changes.setpointDelta}°C`);
  if (typeof changes?.setpoint === 'number') changeList.push(`Setpoint → ${changes.setpoint}°C`);
  if (changes?.door) changeList.push(`Door → ${changes.door}`);
  if (changes?.alert) changeList.push(`Alert: ${changes.alert}`);

  const summary = alert.summary || rule?.description || 'Automation event triggered.';

  return {
    id: `${alert.ruleId}-${alert.triggeredAt}`,
    roomId: alert.roomId,
    ruleId: alert.ruleId,
    ruleName: alert.ruleName || rule?.category || 'Rule',
    summary,
    changeList,
    triggeredAt: alert.triggeredAt || new Date().toISOString(),
  };
}
