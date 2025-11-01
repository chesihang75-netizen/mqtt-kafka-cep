import { onMounted, onUnmounted, reactive, ref } from 'vue';
import rules from '../services/rules';
import {
  ROOMS,
  applyAlert,
  createInitialRoomState,
  createInitialSensorState,
  summariseAlert,
} from '../services/ruleEngine';
import createSimulation from '../services/simulation';

export default function useDashboard() {
  const actions = ref([]);
  const sensorSnapshot = reactive({});
  const roomStates = reactive({});

  ROOMS.forEach((roomId) => {
    sensorSnapshot[roomId] = createInitialSensorState(roomId);
    roomStates[roomId] = createInitialRoomState(roomId);
  });

  const pendingTimers = new Map();

  function handleAlertMessage(message) {
    const enriched = summariseAlert(message);
    actions.value = [enriched, ...actions.value].slice(0, 40);

    const state = roomStates[message.roomId];
    if (state) {
      applyAlert(state, { ...message, ruleName: enriched.ruleName, triggeredAt: enriched.triggeredAt });
      if (typeof message.changes?.dimTo === 'number') {
        scheduleLightLevelRamp(state.roomId, message.changes.dimTo, message.changes.dimDuration ?? 30);
      }
    }
  }

  function handleSensorMessage(message) {
    const target = sensorSnapshot[message.roomId];
    if (!target) return;

    Object.assign(target, {
      ...target,
      co2: Math.round(message.co2),
      temperature: Number(message.temperature.toFixed(1)),
      motion: Boolean(message.motion),
      lux: Math.round(message.lux),
      updatedAt: message.timestamp,
    });

    if (message.doorState) {
      roomStates[message.roomId].door = message.doorState;
    }
  }

  function scheduleLightLevelRamp(roomId, targetLevel, durationSeconds) {
    const existing = pendingTimers.get(roomId);
    if (existing) clearInterval(existing);

    const state = roomStates[roomId];
    if (!state) return;

    const steps = Math.max(1, Math.round(durationSeconds));
    const levelDiff = targetLevel - (state.lightLevel ?? 100);
    const increment = levelDiff / steps;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep += 1;
      const nextLevel = Math.round((state.lightLevel ?? 100) + increment);
      state.lightLevel = Math.max(0, Math.min(100, nextLevel));
      state.updatedAt = new Date().toISOString();

      if (currentStep >= steps) {
        clearInterval(timer);
        pendingTimers.delete(roomId);
        state.lightLevel = targetLevel;
      }
    }, 1000);

    pendingTimers.set(roomId, timer);
  }

  const simulation = createSimulation({ rules, onAlert: handleAlertMessage, onSensor: handleSensorMessage });

  onMounted(() => {
    simulation.start();
  });

  onUnmounted(() => {
    simulation.stop();
    pendingTimers.forEach((timer) => clearInterval(timer));
    pendingTimers.clear();
  });

  return {
    actions,
    sensorSnapshot,
    roomStates,
  };
}
