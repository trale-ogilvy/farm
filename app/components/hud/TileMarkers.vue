<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { TileMarker } from '~/game/core/Engine'
import { useGameStore } from '~/composables/useGameStore'

const { engine, panel } = useGameStore()
const layer = ref<HTMLElement | null>(null)

/**
 * Biểu tượng nổi trên ô đang cần người chơi: 💧 cây khát, liềm cây chín.
 *
 * Cùng cách với bong bóng hành động: engine gọi mỗi frame, ta ghi thẳng vào
 * DOM. Khác ở chỗ số lượng thay đổi — giữ một bể phần tử theo khoá `x,z`, tạo
 * khi ô xuất hiện, gỡ khi ô hết việc; frame thường chỉ tốn phép gán transform.
 *
 * Là nút HTML thật chứ không phải sprite 3D vì bấm vào nó phải trúng ĐÚNG ô
 * đó: biểu tượng lơ lửng trên cây, chiếu xuống đất thì rơi vào ô phía sau.
 */
const nodes = new Map<string, HTMLButtonElement>()
/**
 * Liềm vẽ bằng SVG vì bộ emoji không có cái liềm nào (🌾 là bông lúa, dễ hiểu
 * nhầm thành "cây lúa"). Lưỡi cong màu thép, cán gỗ, viền mực như phần còn lại.
 */
const SICKLE = `<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
  <path d="M4.5 21.5 L10.5 14.5" stroke="#8a6a45" stroke-width="3.6" stroke-linecap="round"/>
  <path d="M8.5 15 C3.5 8.5, 8 1.5, 18.5 2.5 C12.5 4.5, 10.5 8.5, 13 14.5 Z" fill="#dfe4ea" stroke="#4a3728" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`
const ICON = { water: '💧', harvest: SICKLE } as const
const TITLE = { water: 'Tưới nước', harvest: 'Thu hoạch' } as const

function make(m: TileMarker): HTMLButtonElement {
  const b = document.createElement('button')
  b.className = 'marker'
  b.dataset.need = m.need
  if (m.need === 'harvest') b.innerHTML = ICON.harvest
  else b.textContent = ICON.water
  b.title = TITLE[m.need]
  b.addEventListener('click', () => engine.value?.actOnTile(m.x, m.z))
  layer.value?.appendChild(b)
  return b
}

function apply(list: TileMarker[]) {
  const root = layer.value
  if (!root) return
  const seen = new Set<string>()
  for (const m of list) {
    const key = `${m.x},${m.z}`
    seen.add(key)
    let b = nodes.get(key)
    if (b && b.dataset.need !== m.need) {
      b.remove()
      b = undefined
    }
    if (!b) nodes.set(key, (b = make(m)))
    b.style.display = m.visible ? '' : 'none'
    if (!m.visible) continue
    b.style.transform = `translate(-50%, -50%) translate(${m.sx}px, ${m.sy}px)`
    b.classList.toggle('is-far', !m.inRange)
  }
  for (const [key, b] of nodes) {
    if (seen.has(key)) continue
    b.remove()
    nodes.delete(key)
  }
}

watch(
  engine,
  (e) => {
    e?.setMarkerSink(e ? apply : null)
  },
  { immediate: true },
)

onBeforeUnmount(() => engine.value?.setMarkerSink(null))
</script>

<template>
  <!-- Bảng lớn đang mở thì nấp đi, không thì nút nổi nuốt mất cú bấm của bảng. -->
  <div
    ref="layer"
    class="pointer-events-none absolute inset-0 overflow-hidden"
    :class="panel === 'none' ? '' : 'invisible'"
  />
</template>

<style scoped>
/* Nút được tạo bằng DOM thuần nên không có scope attribute — dùng :deep. */
:deep(.marker) {
  pointer-events: auto;
  position: absolute;
  left: 0;
  top: 0;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 2px solid color-mix(in oklab, var(--color-ink) 35%, transparent);
  background: var(--color-paper, #fbf4e6);
  font-size: 12px;
  line-height: 1;
  display: grid;
  place-items: center;
  cursor: pointer;
  box-shadow: 0 2px 0 color-mix(in oklab, var(--color-ink) 25%, transparent);
  will-change: transform;
  animation: bob 1.6s ease-in-out infinite;
  transition: opacity 0.15s ease;
}
:deep(.marker:hover) {
  border-color: var(--color-ink);
}
:deep(.marker.is-far) {
  opacity: 0.55;
}
/* Nhún nhẹ để mắt bắt được từ xa; dùng margin để không đè lên transform. */
@keyframes bob {
  0%,
  100% {
    margin-top: 0;
  }
  50% {
    margin-top: -4px;
  }
}
</style>
