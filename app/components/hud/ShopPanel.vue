<script setup lang="ts">
import { useGameStore } from '~/composables/useGameStore'
import { CROPS, CROP_IDS } from '~/game/data/crops'

const { engine, hud, panel, harvestCount } = useGameStore()

function buy(id: string, qty: number) {
  engine.value?.buySeed(id, qty)
}
</script>

<template>
  <Transition name="panel">
    <aside
      v-if="panel === 'shop'"
      class="panel absolute right-3 top-3 flex max-h-[calc(100%-9rem)] w-80 flex-col"
    >
      <header class="flex items-center justify-between border-b border-white/15 px-4 py-3">
        <h2 class="text-sm font-bold uppercase tracking-widest">Cửa hàng</h2>
        <button class="text-lg leading-none opacity-60 hover:opacity-100" @click="panel = 'none'">
          ✕
        </button>
      </header>

      <div class="flex-1 overflow-y-auto px-3 py-3">
        <button
          class="mb-3 w-full rounded-lg bg-lime-600/30 px-3 py-2.5 text-sm font-bold ring-1 ring-lime-400/40 transition hover:bg-lime-600/45 disabled:opacity-35"
          :disabled="harvestCount === 0"
          @click="engine?.sellAll()"
        >
          Bán toàn bộ nông sản ({{ harvestCount }})
        </button>

        <h3 class="mb-1.5 text-[11px] uppercase tracking-widest opacity-55">Hạt giống</h3>
        <div
          v-for="id in CROP_IDS"
          :key="id"
          class="mb-1.5 flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2"
        >
          <span
            class="h-4 w-4 shrink-0 rounded-full"
            :style="{ background: `#${CROPS[id]!.colorFruit.toString(16).padStart(6, '0')}` }"
          />
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm">{{ CROPS[id]!.name }}</div>
            <div class="text-[10px] opacity-55">
              {{ CROPS[id]!.growMinutes }} phút · bán {{ CROPS[id]!.sellPrice }} xu
            </div>
          </div>
          <button
            class="shrink-0 rounded bg-white/10 px-2 py-1 text-xs tabular-nums transition hover:bg-white/20 disabled:opacity-30"
            :disabled="hud.coins < CROPS[id]!.seedPrice"
            @click="buy(id, 1)"
          >
            {{ CROPS[id]!.seedPrice }}🪙
          </button>
          <button
            class="shrink-0 rounded bg-white/10 px-2 py-1 text-xs tabular-nums transition hover:bg-white/20 disabled:opacity-30"
            :disabled="hud.coins < CROPS[id]!.seedPrice * 10"
            @click="buy(id, 10)"
          >
            ×10
          </button>
        </div>

        <h3 class="mb-1.5 mt-3 text-[11px] uppercase tracking-widest opacity-55">Dụng cụ</h3>
        <div class="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2">
          <span class="text-base">🔴</span>
          <div class="flex-1 text-sm">Bóng bắt pet ×5</div>
          <button
            class="rounded bg-white/10 px-2 py-1 text-xs tabular-nums transition hover:bg-white/20 disabled:opacity-30"
            :disabled="hud.coins < 125"
            @click="engine?.buyBalls(5)"
          >
            125🪙
          </button>
        </div>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateX(12px);
}
</style>
