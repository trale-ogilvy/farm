<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGameStore } from '~/composables/useGameStore'
import type { ItemCategory } from '~/game/data/items'
import { TOOL_INFO } from '~/game/data/items'
import { CROPS } from '~/game/data/crops'
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

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  tool: 'Dụng cụ',
  seed: 'Hạt giống',
  crop: 'Nông sản',
  material: 'Vật liệu',
}

/**
 * Lưới cố định 6 cột, luôn hiện ít nhất 5 hàng, thừa thì cuộn.
 *
 * Số ô luôn là bội của 6 và không bao giờ ít hơn 30, nên ba lô rỗng và ba lô
 * đầy có cùng một hình dạng — đổi tab hay nhặt thêm đồ đều không làm bảng co
 * giãn, và mắt người chơi nhớ được vị trí từng món.
 */
const COLS = 6
const MIN_CELLS = 30

const tab = ref<Tab>('all')
const cursor = ref(0)
const gridEl = ref<HTMLElement | null>(null)

const shown = computed(() =>
  tab.value === 'all'
    ? backpackItems.value
    : backpackItems.value.filter((i) => i.category === tab.value),
)

const cellCount = computed(() =>
  Math.max(MIN_CELLS, Math.ceil(shown.value.length / COLS) * COLS),
)

const selected = computed(() => shown.value[cursor.value] ?? null)

const countIn = (id: Tab) =>
  id === 'all'
    ? backpackItems.value.length
    : backpackItems.value.filter((i) => i.category === id).length

const slotOf = (tool: ToolKind | null | undefined) =>
  tool ? hud.quickSlots.indexOf(tool) : -1

/** Vài dòng mô tả cho khung bên phải. Khung cao cố định nên không xô đẩy. */
const detailLines = computed(() => {
  const item = selected.value
  if (!item) return []
  if (item.tool) {
    const info = TOOL_INFO[item.tool]
    const slot = slotOf(item.tool)
    return [
      info.hint,
      info.needsTool
        ? 'Phải đang cầm thì việc mới hiện ra'
        : 'Không cần cầm — tới gần là làm được',
      slot >= 0 ? `Đang ở ô nhanh số ${slot + 1}` : 'Chưa nằm ở ô nhanh nào',
    ]
  }
  if (item.category === 'seed') {
    const crop = CROPS[item.id.slice(5)]
    return crop
      ? [`Mọc thành ${crop.name} sau khoảng ${crop.growMinutes} phút`, `Giá mua ${crop.seedPrice} xu`]
      : []
  }
  if (item.category === 'crop') {
    const crop = CROPS[item.id]
    return crop ? [`Bán được ${crop.sellPrice} xu`, 'Ăn được để hồi sức (phím R)'] : []
  }
  return ['Nguyên liệu thu từ chặt cây, đập đá']
})

function equip(tool: ToolKind | null | undefined) {
  if (tool) engine.value?.quickEquip(tool)
}

function onDragStart(ev: DragEvent, id: string, index: number) {
  cursor.value = index
  ev.dataTransfer?.setData('text/plain', id)
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy'
}

/**
 * Di con trỏ. Ra ngoài phạm vi thì đứng yên, không cuộn vòng.
 *
 * A/D đi theo THỨ TỰ MÓN (hết dòng thì sang dòng sau), W/S nhảy đúng một hàng.
 * Nếu A/D cũng bị chặn ở mép dòng thì hàng cuối khuyết ô sẽ có món không cách
 * nào tới được — mà đó chính là việc lưới này phải làm: chạm tới mọi món.
 */
function move(dx: number, dy: number) {
  const n = shown.value.length
  if (n === 0) return
  const next = cursor.value + dx + dy * COLS
  if (next < 0 || next >= n) return
  cursor.value = next
  scrollIntoView()
}

function scrollIntoView() {
  nextTick(() => {
    gridEl.value
      ?.querySelector<HTMLElement>(`[data-cell="${cursor.value}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  })
}

function cycleTab(dir: number) {
  const i = TABS.findIndex((t) => t.id === tab.value)
  tab.value = TABS[(i + dir + TABS.length) % TABS.length]!.id
}

function onKey(ev: KeyboardEvent) {
  if (panel.value !== 'backpack') return
  switch (ev.code) {
    case 'KeyW': case 'ArrowUp': move(0, -1); break
    case 'KeyS': case 'ArrowDown': move(0, 1); break
    case 'KeyA': case 'ArrowLeft': move(-1, 0); break
    case 'KeyD': case 'ArrowRight': move(1, 0); break
    case 'KeyQ': cycleTab(-1); break
    case 'KeyE': cycleTab(1); break
    case 'Enter': case 'Space': equip(selected.value?.tool); break
    default: return
  }
  ev.preventDefault()
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// Mở lại ba lô thì về tab đầu và ô đầu: người chơi nhớ "mở ra thấy tất cả" dễ
// hơn nhớ mình đã bỏ dở ở đâu lần trước.
watch(panel, (p) => {
  if (p !== 'backpack') return
  tab.value = 'all'
  cursor.value = 0
  // Nút vừa bấm để mở ba lô vẫn đang giữ focus; bỏ focus đi, nếu không Enter
  // sẽ bấm lại chính nó và đóng bảng ngay khi người chơi định cầm món đồ.
  ;(document.activeElement as HTMLElement | null)?.blur()
})

watch(tab, () => {
  cursor.value = 0
  scrollIntoView()
})

// Dùng hết một loại hạt thì danh sách ngắn lại; kéo con trỏ về trong phạm vi
// thay vì để nó trỏ vào hư không.
watch(shown, (list) => {
  if (cursor.value >= list.length) cursor.value = Math.max(0, list.length - 1)
})
</script>

<template>
  <Transition name="panel">
    <aside
      v-if="panel === 'backpack'"
      class="panel bag absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col"
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

      <nav class="flex gap-1 border-b border-ink/12 px-3 py-2">
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

      <div class="flex">
        <!-- Lưới: cột chốt cứng 56px, chừa sẵn chỗ cho thanh cuộn nên lúc có
             lúc không đều giữ nguyên bề ngang. -->
        <div ref="gridEl" class="grid-area overflow-y-auto p-3">
          <div class="grid gap-2" style="grid-template-columns: repeat(6, 56px)">
            <template v-for="n in cellCount" :key="n">
              <div
                v-if="!shown[n - 1]"
                class="inset-card h-14 w-14 opacity-40"
                :data-cell="n - 1"
              />
              <button
                v-else
                class="inset-card relative grid h-14 w-14 cursor-grab place-items-center transition active:cursor-grabbing"
                :class="cursor === n - 1 ? 'ring-2 ring-clay brightness-105' : 'hover:bg-paper'"
                :data-cell="n - 1"
                draggable="true"
                :title="shown[n - 1]!.name"
                @click="cursor = n - 1"
                @dblclick="equip(shown[n - 1]!.tool)"
                @dragstart="onDragStart($event, shown[n - 1]!.id, n - 1)"
              >
                <span class="text-2xl leading-none">{{ shown[n - 1]!.icon }}</span>
                <span
                  v-if="shown[n - 1]!.count !== null"
                  class="absolute bottom-0 right-1 text-[10px] font-bold tabular-nums opacity-70"
                >
                  {{ shown[n - 1]!.count }}
                </span>
                <span
                  v-if="slotOf(shown[n - 1]!.tool) >= 0"
                  class="absolute left-1 top-0 text-[10px] font-bold text-clay"
                >
                  {{ slotOf(shown[n - 1]!.tool) + 1 }}
                </span>
              </button>
            </template>
          </div>
        </div>

        <!-- Khung thông tin: bề ngang và chiều cao chốt cứng, rỗng cũng chiếm
             đủ chỗ, nên chọn qua chọn lại không làm lưới nhảy. -->
        <aside class="detail-area shrink-0 border-l border-ink/12 p-3">
          <div v-if="!selected" class="grid h-full place-items-center text-center text-xs opacity-45">
            Chọn một ô để xem thông tin
          </div>
          <div v-else class="flex h-full flex-col">
            <div class="inset-card mb-2 grid h-20 shrink-0 place-items-center text-4xl">
              {{ selected.icon }}
            </div>
            <h3 class="text-sm font-bold leading-tight">{{ selected.name }}</h3>
            <p class="mb-2 text-[11px] uppercase tracking-wider opacity-55">
              {{ CATEGORY_LABEL[selected.category] }}
              <span v-if="selected.count !== null" class="tabular-nums">· ×{{ selected.count }}</span>
            </p>
            <ul class="flex-1 space-y-1 overflow-hidden text-[12px] leading-snug opacity-75">
              <li v-for="(line, i) in detailLines" :key="i">{{ line }}</li>
            </ul>
            <button
              v-if="selected.tool"
              class="mt-2 w-full shrink-0 rounded-lg bg-ink px-2 py-1.5 text-xs font-bold text-paper transition hover:brightness-110"
              @click="equip(selected.tool)"
            >
              Cầm lên · Enter
            </button>
            <p v-else class="mt-2 shrink-0 text-center text-[11px] opacity-45">
              Không đặt được vào ô nhanh
            </p>
          </div>
        </aside>
      </div>

      <footer class="border-t border-ink/12 px-4 py-2 text-[11px] opacity-60">
        <kbd>WASD</kbd> chọn ô · <kbd>Q</kbd>/<kbd>E</kbd> đổi tab ·
        <kbd>Enter</kbd> cầm lên · kéo dụng cụ xuống ô nhanh · <kbd>Esc</kbd> đóng
      </footer>
    </aside>
  </Transition>
</template>

<style scoped>
/*
 * Kích thước chốt ở CSS chứ không để nội dung quyết định.
 * 6 cột 56px + 5 khe 8px + đệm 12px hai bên = 424px; 5 hàng nhìn thấy = 320px.
 * `scrollbar-gutter: stable` giữ chỗ cho thanh cuộn sẵn, nên tab 8 món và tab
 * 40 món có cùng bề ngang.
 */
.bag {
  width: 41rem;
}

.grid-area {
  width: 424px;
  height: 320px;
  scrollbar-gutter: stable;
}

.detail-area {
  width: 15rem;
  height: 320px;
}

kbd {
  border: 1px solid color-mix(in oklab, var(--color-ink) 22%, transparent);
  border-radius: 0.3rem;
  padding: 0 0.3rem;
  font-family: inherit;
  font-size: 0.95em;
}

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
