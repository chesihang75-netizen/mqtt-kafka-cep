<template>
  <table class="sensor-table">
    <thead>
      <tr>
        <th>Room</th>
        <th>CO₂ (ppm)</th>
        <th>Temp (°C)</th>
        <th>Motion</th>
        <th>Lux</th>
        <th>Updated</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="room in orderedRooms" :key="room.roomId">
        <td data-label="Room">{{ room.roomId }}</td>
        <td :data-label="'CO₂'" :class="co2Class(room.co2)">{{ room.co2 }}</td>
        <td :data-label="'Temp'" :class="temperatureClass(room.temperature)">{{ room.temperature }}</td>
        <td data-label="Motion" :class="{ active: room.motion }">{{ room.motion ? 'Detected' : 'Idle' }}</td>
        <td data-label="Lux">{{ room.lux }}</td>
        <td data-label="Updated">{{ formatUpdated(room) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  sensors: {
    type: Object,
    default: () => ({}),
  },
});

const orderedRooms = computed(() =>
  Object.values(props.sensors).sort((a, b) => a.roomId.localeCompare(b.roomId))
);

function formatRelative(timestamp) {
  if (!timestamp) return '—';
  const delta = Date.now() - new Date(timestamp).getTime();
  if (delta < 1000) return 'just now';
  const seconds = Math.round(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

function formatUpdated(room) {
  const relative = formatRelative(room.updatedAt);
  if (relative === '—') return relative;

  if (room.source === 'alert') {
    return `${relative} · Alert${room.lastRule ? ` (${room.lastRule})` : ''}`;
  }

  if (room.source === 'sensor') {
    return `${relative} · Telemetry`;
  }

  if (room.source === 'simulation') {
    return `${relative} · Simulation`;
  }

  return relative;
}

function co2Class(value) {
  if (value >= 1000) return 'warn';
  if (value >= 900) return 'caution';
  return '';
}

function temperatureClass(value) {
  if (value >= 27 || value <= 19) return 'warn';
  if (value >= 25 || value <= 20) return 'caution';
  return '';
}
</script>

<style scoped>
.sensor-table {
  width: 100%;
  border-collapse: collapse;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 14px;
  overflow: hidden;
}

th {
  text-align: left;
  padding: 12px 16px;
  background: rgba(24, 40, 84, 0.85);
  color: #fff;
  font-weight: 600;
}

td {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(22, 33, 64, 0.08);
}

tbody tr:last-child td {
  border-bottom: none;
}

.warn {
  color: #b42318;
  font-weight: 700;
}

.caution {
  color: #b85b08;
  font-weight: 600;
}

td.active {
  color: #1b7d4d;
  font-weight: 600;
}

@media (max-width: 768px) {
  .sensor-table,
  thead,
  tbody,
  th,
  td,
  tr {
    display: block;
  }

  th {
    display: none;
  }

  tr {
    margin-bottom: 18px;
    border-radius: 12px;
    box-shadow: 0 10px 24px rgba(17, 29, 61, 0.1);
    overflow: hidden;
  }

  td {
    display: flex;
    justify-content: space-between;
    padding: 10px 14px;
    background: rgba(255, 255, 255, 0.95);
  }

  td::before {
    content: attr(data-label);
    font-weight: 600;
    color: #243056;
  }
}
</style>
