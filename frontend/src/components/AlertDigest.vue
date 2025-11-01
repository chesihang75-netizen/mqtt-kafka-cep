<template>
  <section class="rounded-xl border border-slate-700/60 bg-slate-900/70 p-6 shadow-lg">
    <header class="mb-4 flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-slate-100">iot.alert 去重列表</h2>
        <p class="text-xs text-slate-400">
          通过 Kafka iot.alert 主题聚合最近的唯一动作，自动去重重复告警。
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="rounded-md border border-slate-600/60 px-3 py-1 text-sm text-slate-200 transition hover:border-sky-500/60 hover:text-sky-300"
          :disabled="loading"
          @click="refresh"
        >
          <span v-if="!loading">刷新</span>
          <span v-else class="flex items-center gap-1">
            <span class="h-3 w-3 animate-spin rounded-full border-2 border-slate-500 border-t-transparent"></span>
            加载中
          </span>
        </button>
        <span v-if="lastFetched" class="text-xs text-slate-500">
          最近更新：{{ timeAgo }}
        </span>
      </div>
    </header>

    <p v-if="error" class="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
      无法读取 iot.alert 数据：{{ error.message }}
    </p>

    <ul v-if="alerts.length" class="space-y-3">
      <li
        v-for="alert in alerts"
        :key="alert.fingerprint"
        class="rounded-lg border border-slate-700/60 bg-slate-800/60 p-4 transition hover:border-sky-500/60"
      >
        <div class="mb-1 flex flex-wrap items-center gap-2 text-sm">
          <span class="rounded-full bg-slate-700/80 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-200">
            {{ alert.severity }}
          </span>
          <span class="text-slate-400">{{ alert.source }}</span>
          <span class="text-slate-500">{{ formatTime(alert.timestamp) }}</span>
        </div>
        <h3 class="text-base font-semibold text-slate-100">{{ alert.action }}</h3>
        <p v-if="alert.description" class="mt-1 text-sm text-slate-300">
          {{ alert.description }}
        </p>
        <details class="mt-2 text-xs text-slate-400">
          <summary class="cursor-pointer text-slate-500 hover:text-slate-300">
            查看原始 Payload
          </summary>
          <pre class="mt-2 overflow-x-auto rounded bg-slate-950/60 p-2 text-[11px] leading-relaxed text-amber-200">
{{ formatRaw(alert.raw) }}
          </pre>
        </details>
      </li>
    </ul>

    <div v-else class="flex flex-col items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <span class="text-xl">🛰️</span>
      <span>暂未收到任何 iot.alert 消息</span>
      <span class="text-xs text-slate-600">请确认 Kafka 管道是否产生告警</span>
    </div>
  </section>
</template>

<script setup>
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useAlertStore } from '../stores/alertStore';

dayjs.extend(relativeTime);

const alertStore = useAlertStore();
const { alerts, loading, error, lastFetched } = storeToRefs(alertStore);

const refresh = () => alertStore.fetchAlerts();

const timeAgo = computed(() =>
  lastFetched.value ? dayjs(lastFetched.value).fromNow() : '从未'
);

const formatTime = (value) => dayjs(value).format('YYYY-MM-DD HH:mm:ss');
const formatRaw = (raw) => JSON.stringify(raw, null, 2);

onMounted(() => {
  if (!alerts.value.length) {
    refresh();
  }
});
</script>
