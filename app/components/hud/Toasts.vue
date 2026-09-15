<script setup lang="ts">
import { useGameStore } from '~/composables/useGameStore'

const { toasts } = useGameStore()

const TONE = {
  good: 'border-lime-400/50 text-lime-100',
  bad: 'border-red-400/50 text-red-100',
  info: 'border-white/25 text-farm-parchment',
} as const
</script>

<template>
  <TransitionGroup
    name="toast"
    tag="div"
    class="pointer-events-none absolute bottom-28 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5"
  >
    <div
      v-for="t in toasts"
      :key="t.id"
      class="panel border px-3 py-1.5 text-sm font-medium"
      :class="TONE[t.kind]"
    >
      {{ t.text }}
    </div>
  </TransitionGroup>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.95);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
.toast-move {
  transition: transform 0.25s ease;
}
</style>
