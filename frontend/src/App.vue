<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <header class="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div>
          <p class="text-xs uppercase tracking-[0.35em] text-slate-400">Real-time IoT Operations</p>
          <h1 class="mt-1 text-2xl font-semibold">Action Command Center</h1>
        </div>
        <div class="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span
            v-if="streamConnected"
            class="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-200"
          >
            <span class="h-2 w-2 animate-pulse rounded-full bg-emerald-400"></span>
            Stream connected
          </span>
          <button
            v-else
            type="button"
            class="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-rose-200 transition hover:border-rose-400/50 hover:bg-rose-500/20"
            @click="handleRetry"
          >
            <span class="h-2 w-2 rounded-full bg-rose-400"></span>
            Stream offline · Retry
          </button>
          <span>Last sync: {{ lastSyncLabel }}</span>
          <span class="hidden items-center gap-1 rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-300 sm:inline-flex">
            <span class="h-2 w-2 rounded-full bg-sky-400"></span>
            唯一告警 {{ uniqueAlerts.length }} 条
          </span>
        </div>
      </div>
    </header>

    <div
      v-if="!streamConnected && streamErrorMessage"
      class="mx-auto max-w-6xl px-6 text-xs text-rose-300"
    >
      {{ streamErrorMessage }}<span v-if="reconnectLabel">（{{ reconnectLabel }}）</span>
    </div>

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
        <div class="space-y-6">
          <ActionTimeline :actions="actions" />
          <AlertDigest />
        </div>
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
import AlertDigest from './components/AlertDigest.vue';
import { useActionStore } from './stores/actionStore';
import { useAlertStore } from './stores/alertStore';

const store = useActionStore();
const {
  actions,
  loading,
  lastUpdated,
  streamConnected,
  streamError,
  reconnectAttempts,
  maxReconnectAttempts,
} = storeToRefs(store);

const alertStore = useAlertStore();
const { alerts: uniqueAlerts } = storeToRefs(alertStore);

onMounted(() => {
  store.init();
});

const filters = reactive({
  search: '',
  severity: 'all',
  acknowledged: 'all',
});

const summary = computed(() => store.buildSummary());

const streamErrorMessage = computed(() => streamError.value?.message ?? '');
const reconnectLabel = computed(() => {
  if (!streamError.value) {
    return '';
  }
  const max = Number(maxReconnectAttempts.value || 0);
  const attempts = reconnectAttempts.value;
  if (max > 0) {
    return `重试 ${Math.min(attempts, max)} / ${max}`;
  }
  if (attempts > 0) {
    return `重试 ${attempts} 次`;
  }
  return '';
});

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

const handleRetry = () => {
  store.retryStream();
};
</script>
