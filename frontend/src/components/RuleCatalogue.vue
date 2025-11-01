<template>
  <div class="catalogue">
    <div v-for="group in groupedRules" :key="group.title" class="catalogue__group">
      <h3>{{ group.title }}</h3>
      <ul>
        <li v-for="rule in group.items" :key="rule.id">
          <span class="rule-id">{{ rule.id }}</span>
          <span class="rule-room">{{ rule.room }}</span>
          <span class="rule-desc">{{ rule.description }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import rules from '../services/rules';

const groupedRules = computed(() => {
  const byCategory = rules.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {});

  return Object.entries(byCategory).map(([title, items]) => ({
    title,
    items: items.sort((a, b) => a.id.localeCompare(b.id)),
  }));
});
</script>

<style scoped>
.catalogue {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 18px;
}

.catalogue__group {
  background: rgba(17, 29, 58, 0.04);
  border-radius: 14px;
  padding: 16px 20px;
  border: 1px solid rgba(17, 29, 58, 0.08);
}

h3 {
  margin: 0 0 12px;
  font-size: 1.1rem;
  color: #142046;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

li {
  display: grid;
  grid-template-columns: 70px 80px 1fr;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.75);
}

.rule-id {
  font-weight: 700;
  color: #102253;
}

.rule-room {
  font-weight: 600;
  color: #1f3465;
}

.rule-desc {
  color: #2b3c68;
}
</style>
