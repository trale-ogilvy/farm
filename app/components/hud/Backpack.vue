<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGameStore } from '~/composables/useGameStore'
import type { ItemCategory } from '~/game/data/items'
import type { ToolKind } from '~/game/types'

const { engine, hud, backpackItems, panel } = useGameStore()

type Tab = 'all' | ItemCategory

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'tool', label: 'Dụng cụ' },
  { id: 'seed', label: 'Hạt giống' },
  { id: 'crop', label: 'Nông sản' },
  { id: 'material', label: 'Vật liệu' },
]

const tab = ref<Tab>('all')

// Mở lại ba lô thì về tab đầu: người chơi nhớ "mở ba lô ra thấy tất cả" dễ hơn
// nhớ mình đã bỏ dở ở tab nào lần trước.
watch(panel, (p) => {
  if (p === 'backpack') tab.value = 'all'
})

const shown = computed(() =>
  tab.value === 'all'
    ? backpackItems.value
    : backpackItems.value.filter((i) => i.category === tab.value),
)

const countIn = (id: Tab) =>
  id === 'all' ? backpackItems.value.length : backpackItems.value.filter((i) => i.category === id).length

function equip(tool: ToolKind | null) {
  if (tool) engine.value?.quickEquip(tool)
}

/**
 * Kéo được MỌI vật phẩm, kể cả thứ không đặt vào ô nhanh được.
 *
 * Khoá kéo ở nguồn thì người chơi kéo mãi không nhúc nhích và chỉ kết luận được
 * là giao diện hỏng. Cho kéo rồi từ chối ở ô nhanh kèm một câu giải thích mới
 * dạy được luật "chỉ dụng cụ".
 */
function onDragStart(ev: DragEvent, id: string) {
  ev.dataTransfer?.setData('text/plain', id)
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy'
}

const slotOf = (tool: ToolKind | null) =>
  tool ? hud.quickSlots.indexOf(tool) : -1
</script>

<template>
  <Transition name="panel">
    <aside
      v-if="panel === 'backpack'"
      class="panel absolute left-1/2 top-1/2 flex max-h-[min(34rem,calc(100%-6rem))] w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col"
    >
      <header class="flex items-center justify-between border-b border-ink/12 px-4 py-3">
        <h2 class="text-sm font-bold uppercase tracking-widest">🎒 Ba lô</h2>
        <button
          class="text-lg leading-none opacity-60 hover:opacity-100"
          title="Đóng (Esc)"
          @click="panel = 'none'"
        >
          ✕
        </button>
      </header>

      <nav class="flex flex-wrap gap-1 border-b border-ink/12 px-3 py-2">
        <button
          v-for="t in TABS"
          :key="t.id"
          class="rounded-full px-3 py-1 text-xs uppercase tracking-wider transition"
          :class="tab === t.id ? 'bg-ink text-paper' : 'opacity-60 hover:bg-ink/8 hover:opacity-100'"
          @click="tab = t.id"
        >
          {{ t.label }}
          <span class="tabular-nums opacity-70">{{ countIn(t.id) }}</span>
        </button>
      </nav>

      <div class="min-h-0 flex-1 overflow-y-auto p-3">
        <p v-if="!shown.length" class="py-10 text-center text-sm opacity-60">
          Chưa có gì ở đây.
        </p>

        <ul v-else class="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
          <li
            v-for="item in shown"
            :key="item.id"
            class="inset-card relative flex cursor-grab items-center gap-2 px-2.5 py-2 active:cursor-grabbing"
            draggable="true"
            :title="
              item.tool
                ? 'Kéo vào ô nhanh, hoặc bấm để cầm'
                : item.name + ' — không đặt được vào ô nhanh'
            "
            @dragstart="onDragStart($event, item.id)"
            @click="equip(item.tool)"
          >
            <span class="text-xl leading-none">{{ item.icon }}</span>
            <span class="min-w-0 flex-1 leading-tight">
              <span class="block truncate text-[13px]">{{ item.name }}</span>
              <span v-if="item.count !== null" class="text-[11px] tabular-nums opacity-60">
                ×{{ item.count }}
              </span>
            </span>
            <span
              v-if="slotOf(item.tool) >= 0"
              class="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-clay text-[10px] font-bold text-paper"
              title="Đang nằm ở ô nhanh này"
            >
              {{ slotOf(item.tool) + 1 }}
            </span>
          </li>
        </ul>
      </div>

      <footer class="border-t border-ink/12 px-4 py-2 text-[11px] opacity-60">
        Kéo dụng cụ xuống dãy ô nhanh bên dưới — chỉ dụng cụ đặt được ở đó.
        Chuột phải lên ô nhanh để gỡ.
      </footer>
    </aside>
  </Transition>
</template>

<style scoped>
/* Dùng thuộc tính `scale` riêng, không đụng vào `transform`: hai lớp căn giữa
   `-translate-*` của Tailwind nằm ở đó, ghi đè sẽ làm bảng nhảy lệch góc. */
.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.16s ease, scale 0.16s ease;
}
.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  scale: 0.97;
}
</style>
