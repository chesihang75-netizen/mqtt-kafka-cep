<template>
  <section class="space-y-4">
    <header class="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-950/60 backdrop-blur md:flex-row md:items-center md:justify-between">
      <div>
        <h2 class="text-lg font-semibold">行动队列</h2>
        <p class="text-sm text-slate-400">来自 Siddhi 告警流的实时 Action 列表</p>
      </div>
      <div class="flex flex-wrap gap-3">
        <input
          v-model="localFilter.search"
          type="search"
          placeholder="关键词过滤"
          class="w-48 rounded-full border border-slate-700 bg-slate-950/80 px-4 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/60"
        />
        <select
          v-model="localFilter.severity"
          class="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/60"
        >
          <option value="all">全部级别</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          v-model="localFilter.acknowledged"
          class="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/60"
        >
          <option value="all">全部状态</option>
          <option value="true">已完成</option>
          <option value="false">未完成</option>
        </select>
      </div>
    </header>

    <div class="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 shadow-lg shadow-slate-950/60">
      <table class="w-full min-w-[480px] table-auto">
        <thead class="bg-slate-900/60 text-left text-xs uppercase tracking-widest text-slate-400">
          <tr>
            <th class="px-6 py-3">Action</th>
            <th class="px-6 py-3">Severity</th>
            <th class="px-6 py-3">来源</th>
            <th class="px-6 py-3">执行人</th>
            <th class="px-6 py-3">时间</th>
            <th class="px-6 py-3 text-right">状态</th>
          </tr>
        </thead>
        <tbody>
          <template v-if="loading">
            <tr>
              <td colspan="6" class="px-6 py-12 text-center text-slate-400">正在等待实时数据...</td>
            </tr>
          </template>
          <template v-else-if="filteredActions.length === 0">
            <tr>
              <td colspan="6" class="px-6 py-12 text-center text-slate-400">暂无匹配的 Action</td>
            </tr>
          </template>
          <template v-else>
            <tr
              v-for="action in filteredActions"
              :key="action.id"
              class="border-t border-slate-800/60 hover:bg-slate-900/60"
            >
              <td class="px-6 py-4">
                <p class="font-medium">{{ action.action }}</p>
                <p class="mt-1 text-xs text-slate-400">{{ action.description }}</p>
              </td>
              <td class="px-6 py-4">
                <span :class="severityClass(action.severity)" class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium">
                  <span class="h-1.5 w-1.5 rounded-full" :class="dotClass(action.severity)"></span>
                  {{ action.severity ?? '未标注' }}
                </span>
              </td>
              <td class="px-6 py-4 text-sm text-slate-300">{{ action.source }}</td>
              <td class="px-6 py-4 text-sm text-slate-300">{{ action.owner || '未分配' }}</td>
              <td class="px-6 py-4 text-sm text-slate-300">{{ formatTime(action.timestamp) }}</td>
              <td class="px-6 py-4 text-right">
                <button
                  class="rounded-full border px-3 py-1 text-xs font-medium transition"
                  :class="action.acknowledged ? 'border-success/50 bg-success/10 text-success' : 'border-primary/40 bg-primary/10 text-primary'"
                  @click="$emit('toggle', action)"
                >
                  {{ action.acknowledged ? '已完成' : '标记完成' }}
                </button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup>
import { computed, reactive, watch } from 'vue';
import dayjs from 'dayjs';

const props = defineProps({
  actions: {
    type: Array,
    required: true,
  },
  filter: {
    type: Object,
    required: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['toggle', 'update:filter']);

const localFilter = reactive({ ...props.filter });

watch(
  () => ({ ...props.filter }),
  (next) => Object.assign(localFilter, next)
);

watch(
  localFilter,
  (value) => emit('update:filter', { ...value }),
  { deep: true }
);

const formatTime = (value) =>
  value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '未知时间';

const matchesFilter = (action) => {
  const { search, severity, acknowledged } = localFilter;
  const matchesSearch = search
    ? [action.action, action.description, action.source]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(search.toLowerCase()))
    : true;
  const matchesSeverity = severity === 'all' || (action.severity || '').toLowerCase() === severity;
  const matchesAck =
    acknowledged === 'all' || String(Boolean(action.acknowledged)) === acknowledged;

  return matchesSearch && matchesSeverity && matchesAck;
};

const filteredActions = computed(() => props.actions.filter(matchesFilter));

const severityClass = (severity) => {
  const map = {
    critical: 'border-danger/40 bg-danger/10 text-danger',
    high: 'border-warning/40 bg-warning/10 text-warning text-slate-900',
    medium: 'border-primary/40 bg-primary/10 text-primary',
    low: 'border-slate-600 bg-slate-800 text-slate-200',
  };
  return map[(severity || '').toLowerCase()] ?? 'border-slate-600 bg-slate-800 text-slate-200';
};

const dotClass = (severity) => {
  const map = {
    critical: 'bg-danger',
    high: 'bg-warning',
    medium: 'bg-primary',
    low: 'bg-slate-400',
  };
  return map[(severity || '').toLowerCase()] ?? 'bg-slate-400';
};
</script>
