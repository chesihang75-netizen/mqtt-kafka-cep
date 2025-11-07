<template>
  <section class="grid gap-4 md:grid-cols-4">
    <SummaryCard
      title="当前任务"
      :value="summary.active"
      subtitle="当前未完成的Action"
      accent="border-primary/40 bg-primary/10 text-primary"
    />
    <SummaryCard
      title="已完成"
      :value="summary.acknowledged"
      subtitle="已标记完成的Action"
      accent="border-success/40 bg-success/10 text-success"
    />
    <SummaryCard
      title="高优先级"
      :value="summary.critical"
      subtitle="需要立即关注"
      accent="border-danger/40 bg-danger/10 text-danger"
    />
    <SummaryCard
      title="今日触发"
      :value="summary.today"
      subtitle="24小时内触发"
      accent="border-accent/40 bg-accent/10 text-accent"
    />
  </section>
</template>

<script setup>
import SummaryCard from './SummaryCard.vue';

defineProps({
  summary: {
    type: Object,
    required: true,
  },
});
</script>
