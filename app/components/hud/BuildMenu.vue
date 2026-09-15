<script setup lang="ts">
import { useGameStore } from '~/composables/useGameStore'
import { BUILDINGS, BUILDING_IDS } from '~/game/data/buildings'
import type { BuildingKind } from '~/game/types'

const { engine, panel, buildMode, hud } = useGameStore()

/** Chọn xong là đóng bảng ngay: việc tiếp theo diễn ra ngoài đất, không ở đây. */
function choose(kind: BuildingKind) {
  engine.value?.setBuildMode(kind)
  panel.value = 'none'
}

/** Mỗi giây xây trừ đi `work`; hiện số giây để người chơi hình dung được. */
function seconds(workload: number): string {
  const w = engine.value?.player.state.work ?? 10
  return (workload / w).toFixed(0)
}
</script>

<template>
  <Transition name="panel">
    <aside
      v-if="panel === 'build'"
      class="panel absolute right-3 top-3 flex max-h-[calc(100%-9rem)] w-80 flex-col"
    >
      <header class="flex items-center justify-between border-b border-ink/12 px-4 py-3">
        <h2 class="text-sm font-bold uppercase tracking-widest">Xây dựng</h2>
        <button class="text-lg leading-none opacity-60 hover:opacity-100" @click="panel = 'none'">
          ✕
        </button>
      </header>

      <div class="flex-1 overflow-y-auto px-3 py-3">
        <p class="mb-3 text-[12px] leading-snug opacity-70">
          Chọn một công trình, bấm vào đất trống trong vòng tròn quanh nhà để đặt, rồi tới
          gần bấm <b>F</b> để xây. Sức làm việc của bạn: <b>{{ hud.work }}</b>/giây.
        </p>

        <button
          v-for="id in BUILDING_IDS"
          :key="id"
          class="mb-1.5 flex w-full items-center gap-3 inset-card px-3 py-2.5 text-left transition hover:bg-ink/6"
          :class="buildMode === id ? 'ring-2 ring-clay' : ''"
          @click="choose(id)"
        >
          <span class="text-2xl leading-none">{{ BUILDINGS[id].icon }}</span>
          <span class="flex-1">
            <span class="block text-sm font-bold">{{ BUILDINGS[id].name }}</span>
            <span class="block text-[11px] opacity-65">{{ BUILDINGS[id].desc }}</span>
          </span>
          <span class="text-[11px] tabular-nums opacity-60">
            {{ BUILDINGS[id].workload }} việc · ~{{ seconds(BUILDINGS[id].workload) }}s
          </span>
        </button>
      </div>
    </aside>
  </Transition>

  <!-- Dải nhắc khi đang đặt: nằm giữa mép trên, chỗ mắt lướt qua trước khi bấm. -->
  <div
    v-if="buildMode && panel === 'none'"
    class="panel pointer-events-auto absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-3 px-4 py-2 text-[13px]"
  >
    <span class="text-xl leading-none">{{ BUILDINGS[buildMode].icon }}</span>
    <span>
      Đang đặt <b>{{ BUILDINGS[buildMode].name }}</b> — bấm vào đất trống trong vòng tròn
    </span>
    <button
      class="rounded-md bg-ink/8 px-2 py-1 text-[11px] font-bold uppercase tracking-wider hover:bg-ink/15"
      @click="engine?.setBuildMode(null)"
    >
      Thôi (Esc)
    </button>
  </div>
</template>
