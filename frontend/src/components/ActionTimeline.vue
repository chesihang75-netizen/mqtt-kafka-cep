<template>
  <section class="flex h-full flex-col gap-4">
    <header class="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-lg shadow-slate-950/60 backdrop-blur">
      <h2 class="text-lg font-semibold">最近触发</h2>
      <p class="text-sm text-slate-400">按时间顺序展示最近 10 条 Action</p>
    </header>
    <ol class="grow space-y-4 overflow-y-auto pr-2 scrollbar-thin">
      <li
        v-for="action in recentActions"
        :key="action.id"
        class="relative rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
      >
        <span class="absolute left-0 top-6 -ml-1 h-2 w-2 rounded-full" :class="dotClass(action.severity)"></span>
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm font-medium">{{ action.action }}</p>
          <span class="text-xs text-slate-400">{{ formatTime(action.timestamp) }}</span>
        </div>
        <p class="mt-2 text-xs text-slate-400">
          {{ action.description || '未提供描述' }}
        </p>
        <footer class="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span class="rounded-full border border-slate-700 px-2 py-1">来源：{{ action.source }}</span>
          <span class="rounded-full border border-slate-700 px-2 py-1">优先级：{{ action.severity || '未标注' }}</span>
          <span class="rounded-full border border-slate-700 px-2 py-1">执行人：{{ action.owner || '未分配' }}</span>
          <span
            class="rounded-full border px-2 py-1"
            :class="action.acknowledged ? 'border-success/40 text-success' : 'border-primary/40 text-primary'"
          >
            {{ action.acknowledged ? '已完成' : '未完成' }}
          </span>
        </footer>
      </li>
    </ol>
  </section>
</template>

<script setup>
import { computed } from 'vue';
import dayjs from 'dayjs';

const props = defineProps({
  actions: {
    type: Array,
    required: true,
  },
});

const recentActions = computed(() =>
  [...props.actions]
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    .slice(0, 10)
);

const formatTime = (value) =>
  value ? dayjs(value).format('MM-DD HH:mm') : '未知时间';

const dotClass = (severity) => {
  const map = {
    critical: 'bg-danger',
    high: 'bg-warning',
    medium: 'bg-primary',
    low: 'bg-slate-400',
  };
  return map[(severity || '').toLowerCase()] ?? 'bg-slate-500';
};
</script>
