<script setup lang="ts">
import { useGameStore } from '~/composables/useGameStore'

const { hud, clockText, day, isNight, saveState, backend, harvestCount } = useGameStore()
</script>

<template>
  <div class="pointer-events-none absolute left-3 top-3 flex flex-col gap-2">
    <div class="panel flex items-center gap-3 px-3 py-2">
      <span class="text-lg leading-none">{{ isNight ? '🌙' : '☀️' }}</span>
      <div class="leading-tight">
        <div class="text-xs uppercase tracking-widest opacity-60">Ngày {{ day }}</div>
        <div class="font-mono text-lg font-bold tabular-nums">{{ clockText }}</div>
      </div>
    </div>

    <div class="panel flex items-center gap-3 px-3 py-2 text-sm">
      <span class="font-bold tabular-nums">🪙 {{ hud.coins }}</span>
      <span class="opacity-60">|</span>
      <span class="tabular-nums opacity-80">🧺 {{ harvestCount }}</span>
    </div>

    <div
      class="panel flex w-fit items-center gap-1 px-2.5 py-1 text-[10px] uppercase tracking-widest opacity-75"
    >
      <span>{{ backend === 'firebase' ? '☁️ cloud' : '💾 local' }}</span>
      <span v-if="saveState === 'saving'">· đang lưu…</span>
      <span v-else-if="saveState === 'saved'" class="text-sage">· đã lưu</span>
      <span v-else-if="saveState === 'error'" class="text-[#c05a4a]">· lỗi lưu</span>
    </div>
  </div>
</template>
