<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '~/composables/useGameStore'
import { CROPS, CROP_IDS } from '~/game/data/crops'
import type { ToolKind } from '~/game/types'

const { engine, hud, seedCounts, ballCount } = useGameStore()

const TOOLS: Array<{ id: ToolKind; icon: string; label: string }> = [
  { id: 'hoe', icon: '⛏️', label: 'Cuốc' },
  { id: 'wateringCan', icon: '🪣', label: 'Bình tưới' },
  { id: 'seedBag', icon: '🌱', label: 'Gieo hạt' },
  { id: 'scythe', icon: '🌾', label: 'Thu hoạch' },
  { id: 'axe', icon: '🪓', label: 'Rìu' },
  { id: 'ball', icon: '🔴', label: 'Bóng bắt pet' },
]

const showSeeds = computed(() => hud.tool === 'seedBag')

function pick(tool: ToolKind) {
  engine.value?.setTool(tool)
}

function pickSeed(id: string) {
  engine.value?.selectSeed(id)
}

function badge(tool: ToolKind): string | null {
  if (tool === 'ball') return String(ballCount.value)
  if (tool === 'wateringCan') return String(hud.water)
  return null
}
</script>

<template>
  <div class="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
    <Transition name="slide">
      <div v-if="showSeeds" class="panel flex gap-1 p-1.5">
        <button
          v-for="id in CROP_IDS"
          :key="id"
          class="relative flex w-16 flex-col items-center rounded-md px-2 py-1.5 text-[11px] transition"
          :class="
            hud.selectedSeed === id
              ? 'bg-sage/40 ring-1 ring-sage'
              : 'hover:bg-ink/8'
          "
          :disabled="!seedCounts[id]"
          @click="pickSeed(id)"
        >
          <span
            class="mb-0.5 h-3 w-3 rounded-full"
            :style="{ background: `#${CROPS[id]!.colorFruit.toString(16).padStart(6, '0')}` }"
          />
          <span :class="{ 'opacity-35': !seedCounts[id] }">{{ CROPS[id]!.name }}</span>
          <span class="tabular-nums opacity-60">×{{ seedCounts[id] ?? 0 }}</span>
        </button>
      </div>
    </Transition>

    <div class="panel flex gap-1 p-1.5">
      <button
        v-for="(tool, i) in TOOLS"
        :key="tool.id"
        class="relative grid h-14 w-14 place-items-center rounded-md transition"
        :class="
          hud.tool === tool.id
            ? 'bg-clay/35 ring-2 ring-clay'
            : 'hover:bg-ink/8'
        "
        :title="tool.label"
        @click="pick(tool.id)"
      >
        <span class="text-2xl leading-none">{{ tool.icon }}</span>
        <span class="absolute left-1 top-0.5 text-[10px] opacity-50">{{ i + 1 }}</span>
        <span
          v-if="badge(tool.id)"
          class="absolute bottom-0.5 right-1 text-[10px] font-bold tabular-nums opacity-75"
        >
          {{ badge(tool.id) }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
