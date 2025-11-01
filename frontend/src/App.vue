<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <header class="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div>
          <p class="text-xs uppercase tracking-[0.35em] text-slate-400">Real-time IoT Operations</p>
          <h1 class="mt-1 text-2xl font-semibold">Action Command Center</h1>
        </div>
        <div class="flex items-center gap-3 text-xs text-slate-400">
          <span class="inline-flex items-center gap-2 rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1">
            <span class="h-2 w-2 animate-pulse rounded-full bg-emerald-400"></span>
            Stream connected
          </span>
          <span>Last sync: {{ lastSyncLabel }}</span>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <ActionSummary :summary="summary" />

      <div class="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <ActionTable
          :actions="actions"
          :loading="loading"
          :filter="filters"
          @update:filter="filters = $event"
          @toggle="onToggle"
        />
        <ActionTimeline :actions="actions" />
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, reactive, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import ActionSummary from './components/ActionSummary.vue';
import ActionTable from './components/ActionTable.vue';
import ActionTimeline from './components/ActionTimeline.vue';
import { useActionStore } from './stores/actionStore';

const store = useActionStore();
const { actions, loading, lastUpdated } = storeToRefs(store);

onMounted(() => {
  store.init();
});

const filters = reactive({
  search: '',
  severity: 'all',
  acknowledged: 'all',
});

const summary = computed(() => store.buildSummary());

const lastSyncLabel = computed(() =>
  lastUpdated.value
    ? new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(lastUpdated.value)
    : '尚未同步'
);

const onToggle = (action) => {
  store.toggleAcknowledged(action.id);
};
</script>
