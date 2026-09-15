<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { BuildPrompt } from '~/game/core/Engine'
import { useGameStore } from '~/composables/useGameStore'

const { engine } = useGameStore()
const el = ref<HTMLElement | null>(null)
const labelEl = ref<HTMLElement | null>(null)
const barEl = ref<HTMLElement | null>(null)

/**
 * Cùng cách với bong bóng hành động: engine ghi thẳng vào DOM mỗi frame, không
 * qua ref của Vue, vì toạ độ và tiến độ đổi 60 lần/giây.
 */
let lastLabel = ''
let lastVisible: boolean | null = null
let lastBuilding: boolean | null = null

function apply(p: BuildPrompt) {
  const node = el.value
  if (!node) return

  if (p.visible !== lastVisible) {
    lastVisible = p.visible
    node.style.opacity = p.visible ? '1' : '0'
    node.style.visibility = p.visible ? 'visible' : 'hidden'
    // Xây xong là bãi biến mất ngay trong frame đó, tiến độ cuối engine ghi
    // được luôn hụt một chút (0.97…). Bong bóng mờ dần trong 120ms nên kéo
    // thanh lên kín ống trước khi mờ, không thì lần nào cũng "chưa đầy đã xong".
    if (!p.visible && lastBuilding && barEl.value) barEl.value.style.width = '100%'
  }
  if (!p.visible) return

  node.style.transform = `translate(-50%, -100%) translate(${p.x}px, ${p.y - 12}px)`

  if (p.label !== lastLabel) {
    lastLabel = p.label
    if (labelEl.value) labelEl.value.textContent = p.label
  }
  const building = p.progress !== null
  if (building !== lastBuilding) {
    lastBuilding = building
    node.classList.toggle('is-building', building)
  }
  if (building && barEl.value) barEl.value.style.width = `${(p.progress! * 100).toFixed(1)}%`
}

watch(
  engine,
  (e) => {
    e?.setBuildSink(e ? apply : null)
  },
  { immediate: true },
)

onBeforeUnmount(() => engine.value?.setBuildSink(null))
</script>

<template>
  <div
    ref="el"
    class="prompt panel pointer-events-none absolute left-0 top-0 flex flex-col items-stretch gap-1 px-3 py-1.5"
    style="visibility: hidden; opacity: 0"
  >
    <div class="flex items-center gap-2">
      <span
        class="key grid h-6 w-6 place-items-center rounded-full border-2 border-ink/25 bg-paper-deep text-[11px] font-bold"
      >
        F
      </span>
      <span ref="labelEl" class="text-[13px] font-bold uppercase tracking-wider">—</span>
    </div>
    <!-- Thanh tiến độ chỉ hiện khi đang xây; rộng bằng bong bóng. -->
    <div class="bar h-1.5 overflow-hidden rounded-full bg-ink/12">
      <!-- Không transition: engine ghi width mỗi frame, mượt sẵn; transition chỉ làm thanh trễ sau tiến độ thật. -->
      <div ref="barEl" class="h-full rounded-full bg-sage" style="width: 0%" />
    </div>
  </div>
</template>

<style scoped>
.prompt {
  border-radius: 14px;
  white-space: nowrap;
  transition: opacity 0.12s ease;
  will-change: transform;
}

.prompt .bar {
  display: none;
}

/* Đang xây: giấu phím F (đã bấm rồi), lộ thanh tiến độ. */
.prompt.is-building .bar {
  display: block;
}

.prompt.is-building .key {
  display: none;
}
</style>
