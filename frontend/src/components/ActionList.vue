<template>
  <div class="action-list">
    <div v-if="!actions.length" class="empty">Waiting for actions&hellip;</div>
    <ul v-else>
      <li v-for="item in actions" :key="item.id" class="action-item">
        <div class="action-item__header">
          <span class="room">{{ item.roomId }}</span>
          <span class="rule">{{ item.ruleId }} · {{ item.ruleName }}</span>
          <span class="timestamp">{{ formatTime(item.triggeredAt) }}</span>
        </div>
        <div class="action-item__body">
          <p class="summary">{{ item.summary }}</p>
          <div class="changes">
            <div v-for="change in item.changeList" :key="change" class="chip">{{ change }}</div>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  actions: {
    type: Array,
    default: () => [],
  },
});

const actions = computed(() => props.actions.slice(0, 25));

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
</script>

<style scoped>
.action-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-item {
  background: linear-gradient(135deg, rgba(14, 23, 48, 0.08), rgba(52, 73, 135, 0.12));
  border-radius: 14px;
  padding: 14px 18px;
  border: 1px solid rgba(44, 67, 135, 0.12);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.action-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 24px rgba(22, 34, 74, 0.16);
}

.action-item__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 0.95rem;
  font-weight: 600;
}

.room {
  background: #142252;
  color: #fff;
  padding: 4px 10px;
  border-radius: 999px;
  letter-spacing: 0.05em;
}

.rule {
  color: #17264c;
}

.timestamp {
  margin-left: auto;
  color: #5c678d;
}

.summary {
  margin: 10px 0 8px;
  font-size: 1.05rem;
  color: #15203c;
}

.changes {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip {
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(21, 40, 102, 0.12);
  color: #0f2354;
  font-size: 0.82rem;
  font-weight: 600;
}

.empty {
  background: rgba(255, 255, 255, 0.8);
  padding: 20px;
  border-radius: 14px;
  text-align: center;
  color: #5d6888;
}
</style>
