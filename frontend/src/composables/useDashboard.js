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
import createKafkaBridge from '../services/kafkaBridge';

export default function useDashboard() {
  const actions = ref([]);
  const sensorSnapshot = reactive({});
  const roomStates = reactive({});
  const connectionStatus = reactive({ alerts: false, sensors: false, simulation: false });

  ROOMS.forEach((roomId) => {
    sensorSnapshot[roomId] = createInitialSensorState(roomId);
    roomStates[roomId] = createInitialRoomState(roomId);
  });

  const pendingTimers = new Map();

  const simulationPreference = (import.meta.env.VITE_ENABLE_SIMULATION || 'auto').toLowerCase();
  let simulationActive = false;

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

    if (Number.isFinite(message.co2)) {
      target.co2 = Math.round(message.co2);
    }
    if (Number.isFinite(message.temperature)) {
      target.temperature = Math.round(message.temperature * 10) / 10;
    }
    if (typeof message.motion === 'boolean') {
      target.motion = message.motion;
    } else if (message.motion != null) {
      target.motion = Boolean(message.motion);
    }
    if (Number.isFinite(message.lux)) {
      target.lux = Math.round(message.lux);
    }

    target.updatedAt = message.timestamp || new Date().toISOString();

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
  const kafkaBridge = createKafkaBridge({
    onAlert: handleAlertMessage,
    onSensor: handleSensorMessage,
    onStatusChange: (key, connected) => {
      connectionStatus[key] = connected;
      if (simulationPreference === 'auto') {
        if (connected) {
          stopSimulation();
        } else if (!connectionStatus.alerts && !connectionStatus.sensors) {
          startSimulation();
        }
      }
    },
  });

  function startSimulation() {
    if (simulationActive || simulationPreference === 'never') return;
    simulation.start();
    simulationActive = true;
    connectionStatus.simulation = true;
  }

  function stopSimulation() {
    if (!simulationActive) return;
    simulation.stop();
    simulationActive = false;
    connectionStatus.simulation = false;
  }

  onMounted(() => {
    const bridgeConfigured = kafkaBridge.start();
    if (simulationPreference === 'always') {
      startSimulation();
    } else if (simulationPreference === 'never') {
      stopSimulation();
    } else if (!bridgeConfigured) {
      startSimulation();
    }
  });

  onUnmounted(() => {
    kafkaBridge.stop();
    stopSimulation();
    pendingTimers.forEach((timer) => clearInterval(timer));
    pendingTimers.clear();
  });

  return {
    actions,
    sensorSnapshot,
    roomStates,
    connectionStatus,
  };
}
