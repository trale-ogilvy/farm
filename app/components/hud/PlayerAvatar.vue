<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '~/composables/useGameStore'

const { hud, panel } = useGameStore()

/**
 * Vòng sức bao quanh avatar. Dùng chu vi đường tròn làm thang đo: `stroke-dasharray`
 * bằng đúng chu vi thì offset chạy từ 0 (đầy) tới chu vi (rỗng).
 */
const R = 30
const CIRC = 2 * Math.PI * R

const pct = computed(() => Math.max(0, Math.min(1, hud.energy / hud.maxEnergy)))
const dash = computed(() => CIRC * (1 - pct.value))
const tone = computed(() =>
  pct.value > 0.5 ? 'var(--color-sage)' : pct.value > 0.2 ? 'var(--color-clay)' : '#c05a4a',
)
</script>

<template>
  <button
    class="panel relative grid h-[68px] w-[68px] shrink-0 place-items-center rounded-full transition hover:brightness-[1.03]"
    title="Ba lô (B)"
    @click="panel = panel === 'backpack' ? 'none' : 'backpack'"
  >
    <!-- Vòng sức vẽ ở lớp dưới cùng, xoay -90° để bắt đầu từ đỉnh đầu. -->
    <svg class="absolute inset-0 -rotate-90" viewBox="0 0 68 68">
      <circle cx="34" cy="34" :r="R" fill="none" stroke="var(--color-paper-deep)" stroke-width="4" />
      <circle
        cx="34"
        cy="34"
        :r="R"
        fill="none"
        :stroke="tone"
        stroke-width="4"
        stroke-linecap="round"
        :stroke-dasharray="CIRC"
        :stroke-dashoffset="dash"
        class="transition-[stroke-dashoffset] duration-300"
      />
    </svg>

    <!-- Cùng bảng màu với model 3D trong Materials.ts: nón chàm, áo kem. -->
    <svg viewBox="0 0 40 40" class="h-10 w-10">
      <g stroke="#4a3728" stroke-width="1.6" stroke-linejoin="round">
        <path d="M8 34c0-6 5.4-9 12-9s12 3 12 9z" fill="#f4efe2" />
        <circle cx="20" cy="17" r="8" fill="#e8c39a" />
        <path d="M9 15c1-6 5.5-9 11-9s10 3 11 9c-4-2.2-7.3-3.2-11-3.2S13 12.8 9 15z" fill="#3f5d87" />
        <path d="M7.5 15.4h25" fill="none" stroke-linecap="round" />
      </g>
      <circle cx="17" cy="18.5" r="1.3" fill="#4a3728" />
      <circle cx="23.4" cy="18.5" r="1.3" fill="#4a3728" />
      <path d="M18 22.6q2 1.4 4 0" fill="none" stroke="#4a3728" stroke-width="1.3" stroke-linecap="round" />
    </svg>

    <span
      class="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-paper px-1.5 text-[10px] font-bold tabular-nums shadow-sm"
    >
      {{ Math.round(hud.energy) }}
    </span>
  </button>
</template>
