<template>
  <table class="room-table">
    <thead>
      <tr>
        <th>Room</th>
        <th>Lights</th>
        <th>Door</th>
        <th>HVAC</th>
        <th>Setpoint (°C)</th>
        <th>Last Rule</th>
        <th>Updated</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="room in orderedRooms" :key="room.roomId">
        <td data-label="Room">{{ room.roomId }}</td>
        <td :data-label="'Lights'" :class="lightsClass(room)">
          {{ room.lights }}<span v-if="room.lightLevel !== null"> · {{ room.lightLevel }}%</span>
        </td>
        <td data-label="Door">{{ room.door }}</td>
        <td data-label="HVAC" :class="hvacClass(room.hvac)">{{ room.hvac }}</td>
        <td data-label="Setpoint">{{ room.setpoint ?? '—' }}</td>
        <td data-label="Last Rule">{{ room.lastRule || '—' }}</td>
        <td data-label="Updated">{{ formatRelative(room.updatedAt) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  rooms: {
    type: Object,
    default: () => ({}),
  },
});

const orderedRooms = computed(() =>
  Object.values(props.rooms).sort((a, b) => a.roomId.localeCompare(b.roomId))
);

function lightsClass(room) {
  if (room.lights === 'OFF' || room.lightLevel === 0) return 'off';
  if (room.lightLevel !== null && room.lightLevel < 100) return 'dimmed';
  return '';
}

function hvacClass(mode) {
  if (mode === 'BOOST') return 'boost';
  if (mode === 'ECO') return 'eco';
  return '';
}

function formatRelative(timestamp) {
  if (!timestamp) return '—';
  const delta = Date.now() - new Date(timestamp).getTime();
  if (delta < 1000) return 'just now';
  const seconds = Math.round(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}
</script>

<style scoped>
.room-table {
  width: 100%;
  border-collapse: collapse;
  border-radius: 14px;
  overflow: hidden;
}

th {
  text-align: left;
  padding: 12px 16px;
  background: rgba(23, 36, 74, 0.92);
  color: #fff;
}

td {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(19, 30, 61, 0.08);
}

tbody tr:last-child td {
  border-bottom: none;
}

.off {
  color: #9b1c1c;
  font-weight: 600;
}

.dimmed {
  color: #b2710d;
  font-weight: 600;
}

.boost {
  color: #126e37;
  font-weight: 600;
}

.eco {
  color: #2563eb;
  font-weight: 600;
}

@media (max-width: 768px) {
  .room-table,
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
    box-shadow: 0 12px 28px rgba(18, 30, 66, 0.12);
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
    color: #253157;
  }
}
</style>
