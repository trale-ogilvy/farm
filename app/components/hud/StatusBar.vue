<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '~/composables/useGameStore'

const { hud, clockText, day, isNight, saveState, backend, harvestCount } = useGameStore()

const energyPct = computed(() => (hud.energy / hud.maxEnergy) * 100)
const waterPct = computed(() => (hud.water / hud.maxWater) * 100)
const energyTone = computed(() =>
  energyPct.value > 50 ? 'bg-sage' : energyPct.value > 20 ? 'bg-clay' : 'bg-[#c05a4a]',
)
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

    <div class="panel w-44 px-3 py-2">
      <div class="mb-1 flex justify-between text-[11px] uppercase tracking-wider opacity-70">
        <span>Sức</span>
        <span class="tabular-nums">{{ Math.round(hud.energy) }}</span>
      </div>
      <div class="h-2.5 overflow-hidden rounded-full bg-ink/12">
        <div
          class="h-full rounded-full transition-[width] duration-200"
          :class="energyTone"
          :style="{ width: `${energyPct}%` }"
        />
      </div>

      <div class="mb-1 mt-2 flex justify-between text-[11px] uppercase tracking-wider opacity-70">
        <span>Nước</span>
        <span class="tabular-nums">{{ hud.water }}/{{ hud.maxWater }}</span>
      </div>
      <div class="h-2.5 overflow-hidden rounded-full bg-ink/12">
        <div
          class="h-full rounded-full bg-[#7fb8cf] transition-[width] duration-200"
          :style="{ width: `${waterPct}%` }"
        />
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
