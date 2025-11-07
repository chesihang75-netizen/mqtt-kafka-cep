<template>
  <article
    class="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg shadow-slate-950/60 backdrop-blur"
    :class="accent"
  >
    <header class="flex items-center justify-between">
      <h2 class="text-sm font-medium text-slate-400">{{ title }}</h2>
      <slot name="icon"></slot>
    </header>
    <p class="mt-4 text-3xl font-semibold">{{ value }}</p>
    <p class="mt-3 text-xs text-slate-400">{{ subtitle }}</p>
  </article>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
  value: {
    type: [String, Number],
    required: true,
  },
  subtitle: {
    type: String,
    default: '',
  },
  accent: {
    type: String,
    default: '',
  },
});
</script>
