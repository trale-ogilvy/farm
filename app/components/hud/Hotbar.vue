<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '~/composables/useGameStore'
import { REMOVE_TOOL, TOOL_INFO, isTool } from '~/game/data/items'
import { QUICK_SLOTS } from '~/game/core/Engine'
import type { ToolKind } from '~/game/types'

const { engine, hud, ballCount, pushToast } = useGameStore()

/** Ô đang được kéo vật phẩm lên trên — chỉ để tô sáng, không giữ dữ liệu. */
const hoverSlot = ref(-1)
/** Ô đang được kéo đi (kéo trong dãy để đổi chỗ). */
const dragSlot = ref(-1)

/** Ô cuối là dụng cụ dỡ bỏ: cố định, không kéo, không thả vào, không gỡ. */
const pinned = (index: number) => index === QUICK_SLOTS - 1

/** Bấm ô đang chọn là buông dụng cụ ra: tay không thì không có gì sáng lên. */
function pick(index: number) {
  const tool = hud.quickSlots[index]
  if (!tool) return
  engine.value?.setTool(hud.tool === tool ? null : tool)
}

function badge(tool: ToolKind): string | null {
  if (tool === 'ball') return String(ballCount.value)
  return null
}

function onDragStart(index: number, ev: DragEvent) {
  const tool = hud.quickSlots[index]
  if (!tool || pinned(index) || !ev.dataTransfer) return
  dragSlot.value = index
  // Cùng định dạng với ba lô kéo vào, nên một hàm `onDrop` xử lý cả hai nguồn.
  ev.dataTransfer.setData('text/plain', tool)
  ev.dataTransfer.effectAllowed = 'move'
}

function onDrop(index: number, ev: DragEvent) {
  hoverSlot.value = -1
  dragSlot.value = -1
  if (pinned(index)) {
    pushToast('Ô 🗑️ là dụng cụ dỡ bỏ, cố định', 'bad')
    return
  }
  const id = ev.dataTransfer?.getData('text/plain') ?? ''
  // Chỉ dụng cụ mới đặt được vào đây. Hạt giống và nông sản đi theo hành động
  // chứ không theo thứ đang cầm, nên một ô "hạt cà rốt" sẽ không có nghĩa gì.
  if (!isTool(id)) {
    pushToast('Chỉ dụng cụ mới đặt được vào ô nhanh', 'bad')
    return
  }
  // `setQuickSlot` tự đổi chỗ nếu dụng cụ đã ở ô khác — kéo trong dãy và kéo
  // từ ba lô vào là cùng một thao tác.
  engine.value?.setQuickSlot(index, id)
}

/** Chuột phải để gỡ dụng cụ khỏi ô — dãy phím thưa cũng là một lựa chọn. */
function clear(index: number) {
  if (hud.quickSlots[index] && !pinned(index)) engine.value?.setQuickSlot(index, null)
}
</script>

<template>
  <!-- Cột dọc bên trái, ngay trên avatar. Ô cuối là 🗑️ dỡ bỏ, luôn ở đó. -->
  <div class="panel absolute bottom-[6.5rem] left-4 flex flex-col gap-1 p-1.5">
    <button
      v-for="i in QUICK_SLOTS"
      :key="i"
      class="relative grid h-12 w-12 place-items-center rounded-md transition"
      :class="[
        hud.quickSlots[i - 1] && hud.tool === hud.quickSlots[i - 1]
          ? 'bg-clay/35 ring-2 ring-clay'
          : 'hover:bg-ink/8',
        hoverSlot === i - 1 ? 'ring-2 ring-sage' : '',
        dragSlot === i - 1 ? 'opacity-40' : '',
        !hud.quickSlots[i - 1] ? 'inset-card' : '',
        pinned(i - 1) ? 'mt-1 border-t border-ink/12 pt-1' : '',
      ]"
      :draggable="!!hud.quickSlots[i - 1] && !pinned(i - 1)"
      :title="
        pinned(i - 1)
          ? TOOL_INFO[REMOVE_TOOL].name + ' — ' + TOOL_INFO[REMOVE_TOOL].hint + '. Ô cố định.'
          : hud.quickSlots[i - 1]
            ? TOOL_INFO[hud.quickSlots[i - 1]!].name +
              (hud.tool === hud.quickSlots[i - 1] ? ' — bấm để buông ra' : ' — bấm để cầm') +
              ', kéo để đổi chỗ, chuột phải để gỡ'
            : 'Ô trống — kéo dụng cụ từ ba lô vào'
      "
      @click="pick(i - 1)"
      @contextmenu.prevent="clear(i - 1)"
      @dragstart="onDragStart(i - 1, $event)"
      @dragend="dragSlot = -1"
      @dragover.prevent="hoverSlot = i - 1"
      @dragleave="hoverSlot = hoverSlot === i - 1 ? -1 : hoverSlot"
      @drop.prevent="onDrop(i - 1, $event)"
    >
      <span v-if="hud.quickSlots[i - 1]" class="text-xl leading-none">
        {{ TOOL_INFO[hud.quickSlots[i - 1]!].icon }}
      </span>
      <span v-if="!pinned(i - 1)" class="absolute left-1 top-0.5 text-[10px] opacity-50">{{ i }}</span>
      <span
        v-if="hud.quickSlots[i - 1] && badge(hud.quickSlots[i - 1]!)"
        class="absolute bottom-0.5 right-1 text-[10px] font-bold tabular-nums opacity-75"
      >
        {{ badge(hud.quickSlots[i - 1]!) }}
      </span>
    </button>
  </div>
</template>
