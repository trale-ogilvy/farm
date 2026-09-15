<script setup lang="ts">
import { useGameStore } from '~/composables/useGameStore'
import type { Panel } from '~/composables/useGameStore'

const { panel, pets } = useGameStore()

const BUTTONS: Array<{ id: Panel; icon: string; label: string; hint?: string }> = [
  { id: 'build', icon: '🔨', label: 'Xây dựng', hint: 'B' },
  { id: 'backpack', icon: '🎒', label: 'Ba lô', hint: 'I' },
  { id: 'pets', icon: '🐾', label: 'Pet', hint: 'Tab' },
  { id: 'shop', icon: '🏪', label: 'Cửa hàng' },
]

function toggle(id: Panel) {
  panel.value = panel.value === id ? 'none' : id
}
</script>

<template>
  <div class="absolute right-3 top-3 flex flex-col gap-1.5" :class="panel !== 'none' ? 'pointer-events-none opacity-0' : ''">
    <button
      v-for="b in BUTTONS"
      :key="b.id"
      class="panel relative grid h-12 w-12 place-items-center transition hover:bg-ink/8"
      :title="b.label"
      @click="toggle(b.id)"
    >
      <span class="text-xl leading-none">{{ b.icon }}</span>
      <span
        v-if="b.id === 'pets' && pets.length"
        class="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-clay text-[10px] font-bold text-paper"
      >
        {{ pets.length }}
      </span>
      <span v-if="b.hint" class="absolute bottom-0 text-[9px] opacity-40">{{ b.hint }}</span>
    </button>
  </div>
</template>
