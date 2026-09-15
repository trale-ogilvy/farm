<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '~/composables/useGameStore'
import { TOOL_INFO, isTool } from '~/game/data/items'
import { QUICK_SLOTS } from '~/game/core/Engine'
import type { ToolKind } from '~/game/types'

const { engine, hud, ballCount, pushToast } = useGameStore()

/** Ô đang được kéo vật phẩm lên trên — chỉ để tô sáng, không giữ dữ liệu. */
const hoverSlot = ref(-1)

function pick(index: number) {
  const tool = hud.quickSlots[index]
  if (tool) engine.value?.setTool(tool)
}

function badge(tool: ToolKind): string | null {
  if (tool === 'ball') return String(ballCount.value)
  if (tool === 'wateringCan') return String(hud.water)
  return null
}

function onDrop(index: number, ev: DragEvent) {
  hoverSlot.value = -1
  const id = ev.dataTransfer?.getData('text/plain') ?? ''
  // Chỉ dụng cụ mới đặt được vào đây. Hạt giống và nông sản đi theo hành động
  // chứ không theo thứ đang cầm, nên một ô "hạt cà rốt" sẽ không có nghĩa gì.
  if (!isTool(id)) {
    pushToast('Chỉ dụng cụ mới đặt được vào ô nhanh', 'bad')
    return
  }
  engine.value?.setQuickSlot(index, id)
  engine.value?.setTool(id)
}

/** Chuột phải để gỡ dụng cụ khỏi ô — dãy phím thưa cũng là một lựa chọn. */
function clear(index: number) {
  if (hud.quickSlots[index]) engine.value?.setQuickSlot(index, null)
}
</script>

<template>
  <div class="absolute bottom-4 left-4 flex items-end gap-2.5">
    <HudPlayerAvatar />

    <div class="panel flex gap-1 p-1.5">
      <button
        v-for="i in QUICK_SLOTS"
        :key="i"
        class="relative grid h-14 w-14 place-items-center rounded-md transition"
        :class="[
          hud.quickSlots[i - 1] && hud.tool === hud.quickSlots[i - 1]
            ? 'bg-clay/35 ring-2 ring-clay'
            : 'hover:bg-ink/8',
          hoverSlot === i - 1 ? 'ring-2 ring-sage' : '',
          !hud.quickSlots[i - 1] ? 'inset-card' : '',
        ]"
        :title="
          hud.quickSlots[i - 1]
            ? TOOL_INFO[hud.quickSlots[i - 1]!].name + ' — chuột phải để gỡ'
            : 'Ô trống — kéo dụng cụ từ ba lô vào'
        "
        @click="pick(i - 1)"
        @contextmenu.prevent="clear(i - 1)"
        @dragover.prevent="hoverSlot = i - 1"
        @dragleave="hoverSlot = hoverSlot === i - 1 ? -1 : hoverSlot"
        @drop.prevent="onDrop(i - 1, $event)"
      >
        <span v-if="hud.quickSlots[i - 1]" class="text-2xl leading-none">
          {{ TOOL_INFO[hud.quickSlots[i - 1]!].icon }}
        </span>
        <span class="absolute left-1 top-0.5 text-[10px] opacity-50">{{ i }}</span>
        <span
          v-if="hud.quickSlots[i - 1] && badge(hud.quickSlots[i - 1]!)"
          class="absolute bottom-0.5 right-1 text-[10px] font-bold tabular-nums opacity-75"
        >
          {{ badge(hud.quickSlots[i - 1]!) }}
        </span>
      </button>
    </div>
  </div>
</template>
