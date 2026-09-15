<script setup lang="ts">
import { useGameStore } from '~/composables/useGameStore'
import { CROPS, CROP_IDS } from '~/game/data/crops'
import { cropIcon } from '~/game/data/items'

const { engine, seedPicker, seedCounts, emptyPlots } = useGameStore()

/**
 * Chọn hạt là gieo luôn cả ruộng, không phải "đổi loại hạt đang cầm". Vì vậy
 * bảng đóng ngay sau khi chọn: việc đã xong, giữ nó mở chỉ tổ che mất cảnh.
 */
function sow(id: string) {
  if (!seedCounts.value[id]) return
  engine.value?.sowAll(id)
  seedPicker.value = false
}

function tint(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`
}
</script>

<template>
  <Transition name="pick">
    <aside
      v-if="seedPicker"
      class="panel absolute bottom-4 right-4 w-60 overflow-hidden"
    >
      <header class="flex items-center justify-between border-b border-ink/12 px-3 py-2">
        <div class="leading-tight">
          <h2 class="text-xs font-bold uppercase tracking-widest">Gieo hạt</h2>
          <p class="text-[11px] opacity-60">
            <span class="tabular-nums">{{ emptyPlots }}</span> luống trống
          </p>
        </div>
        <button
          class="text-lg leading-none opacity-60 hover:opacity-100"
          title="Đóng (Esc)"
          @click="seedPicker = false"
        >
          ✕
        </button>
      </header>

      <ul class="max-h-[15.5rem] overflow-y-auto p-1.5">
        <li v-for="id in CROP_IDS" :key="id">
          <button
            class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition"
            :class="seedCounts[id] ? 'hover:bg-sage/30' : 'cursor-not-allowed opacity-35'"
            :disabled="!seedCounts[id]"
            @click="sow(id)"
          >
            <span class="text-lg leading-none">{{ cropIcon(id) }}</span>
            <span class="min-w-0 flex-1 leading-tight">
              <span class="block truncate text-[13px]">{{ CROPS[id]!.name }}</span>
              <span class="text-[11px] tabular-nums opacity-60">
                còn {{ seedCounts[id] ?? 0 }} hạt
              </span>
            </span>
            <span
              class="h-3 w-3 shrink-0 rounded-full"
              :style="{ background: tint(CROPS[id]!.colorFruit) }"
            />
          </button>
        </li>
      </ul>

      <p class="border-t border-ink/12 px-3 py-1.5 text-[11px] opacity-60">
        Chọn một loại là gieo kín ruộng, trái sang phải.
      </p>
    </aside>
  </Transition>
</template>

<style scoped>
.pick-enter-active,
.pick-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.pick-enter-from,
.pick-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
