<script setup lang="ts">
import { useGameStore } from '~/composables/useGameStore'

const { panel } = useGameStore()
</script>

<template>
  <button
    class="panel relative grid h-[68px] w-[68px] shrink-0 place-items-center rounded-full transition hover:brightness-[1.03]"
    title="Ba lô (I)"
    @click="panel = panel === 'backpack' ? 'none' : 'backpack'"
  >
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
  </button>
</template>
