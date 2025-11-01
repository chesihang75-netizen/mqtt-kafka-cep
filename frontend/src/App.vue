<template>
  <div class="app">
    <header class="app__header">
      <h1>IoT Facilities Command Center</h1>
      <p class="subtitle">
        Real-time overview of classroom automation rules, sensor telemetry, and device states.
      </p>
    </header>

    <main class="app__content">
      <section class="panel actions">
        <header>
          <h2>Triggered Actions</h2>
          <p>Kafka topic: <code>iot.alerts</code></p>
        </header>
        <ActionList :actions="actions" />
      </section>

      <section class="grid">
        <section class="panel sensors">
          <header>
            <h2>Sensor Telemetry</h2>
            <p>Kafka topic: <code>iot.input</code></p>
          </header>
          <SensorGrid :sensors="sensorSnapshot" />
        </section>

        <section class="panel rooms">
          <header>
            <h2>Room Status</h2>
            <p>Lights, door, and HVAC modes per classroom.</p>
          </header>
          <RoomStatusPanel :rooms="roomStates" />
        </section>
      </section>

      <section class="panel rules">
        <header>
          <h2>Automation Rules Catalogue</h2>
          <p>
            Reference of all implemented automation policies. Each incoming action references one of these
            rule identifiers.
          </p>
        </header>
        <RuleCatalogue />
      </section>
    </main>
  </div>
</template>

<script setup>
import ActionList from './components/ActionList.vue';
import SensorGrid from './components/SensorGrid.vue';
import RoomStatusPanel from './components/RoomStatusPanel.vue';
import RuleCatalogue from './components/RuleCatalogue.vue';
import useDashboard from './composables/useDashboard';

const { actions, sensorSnapshot, roomStates } = useDashboard();
</script>

<style scoped>
.app {
  min-height: 100vh;
  background: radial-gradient(circle at top, #ffffff 0%, #eef2ff 60%, #dde3f5 100%);
  padding-bottom: 40px;
}

.app__header {
  padding: 32px 48px 12px;
  background-color: rgba(14, 28, 57, 0.82);
  color: #fefefe;
  box-shadow: 0 12px 40px rgba(14, 28, 57, 0.25);
}

.app__header h1 {
  margin: 0;
  font-size: 2.4rem;
  letter-spacing: 0.04em;
}

.subtitle {
  margin: 12px 0 0;
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.85);
}

.app__content {
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 0 48px;
}

.panel {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 18px;
  padding: 24px 28px;
  box-shadow: 0 20px 45px rgba(15, 32, 68, 0.15);
  backdrop-filter: blur(6px);
}

.panel header {
  margin-bottom: 18px;
}

.panel header h2 {
  margin: 0;
  font-size: 1.6rem;
}

.panel header p {
  margin: 6px 0 0;
  color: #4a5674;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 24px;
}

@media (max-width: 768px) {
  .app__header {
    padding: 24px;
  }

  .app__content {
    padding: 0 18px;
  }
}
</style>
