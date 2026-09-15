<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { ActionPrompt } from '~/game/core/Engine'
import { useGameStore } from '~/composables/useGameStore'

const { engine } = useGameStore()
const el = ref<HTMLElement | null>(null)
const labelEl = ref<HTMLElement | null>(null)

/**
 * Bong bóng được cập nhật bằng cách ghi thẳng vào DOM, không qua ref của Vue.
 *
 * Engine gọi hàm này mỗi frame. Nếu để Vue theo dõi toạ độ, mỗi frame sẽ kích
 * hoạt một lượt patch component — thứ mà cả kiến trúc này được dựng lên để
 * tránh. Chữ chỉ ghi lại khi thực sự đổi, nên phần lớn frame chỉ tốn một phép
 * gán `transform`.
 */
let lastLabel = ''
let lastVisible: boolean | null = null
let lastEnabled: boolean | null = null

function apply(p: ActionPrompt) {
  const node = el.value
  if (!node) return

  if (p.visible !== lastVisible) {
    lastVisible = p.visible
    node.style.opacity = p.visible ? '1' : '0'
    node.style.visibility = p.visible ? 'visible' : 'hidden'
  }
  if (!p.visible) return

  node.style.transform = `translate(-50%, -100%) translate(${p.x}px, ${p.y - 12}px)`

  if (p.label !== lastLabel) {
    lastLabel = p.label
    if (labelEl.value) labelEl.value.textContent = p.label
    // Nảy nhẹ khi đổi việc, để mắt bắt được rằng phím F giờ làm chuyện khác.
    node.classList.remove('pop')
    void node.offsetWidth
    node.classList.add('pop')
  }
  if (p.enabled !== lastEnabled) {
    lastEnabled = p.enabled
    node.classList.toggle('is-disabled', !p.enabled)
  }
}

watch(
  engine,
  (e) => {
    e?.setPromptSink(e ? apply : null)
  },
  { immediate: true },
)

onBeforeUnmount(() => engine.value?.setPromptSink(null))
</script>

<template>
  <div
    ref="el"
    class="prompt panel pointer-events-none absolute left-0 top-0 flex items-center gap-2 py-1 pl-1 pr-3"
    style="visibility: hidden; opacity: 0"
  >
    <span
      class="grid h-6 w-6 place-items-center rounded-full border-2 border-ink/25 bg-paper-deep text-[11px] font-bold"
    >
      F
    </span>
    <span ref="labelEl" class="text-[13px] font-bold uppercase tracking-wider">—</span>
  </div>
</template>

<style scoped>
.prompt {
  border-radius: 999px;
  white-space: nowrap;
  transition: opacity 0.12s ease;
  will-change: transform;
}

.prompt.is-disabled {
  opacity: 0.45;
  filter: grayscale(0.5);
}

/* Nảy một nhịp khi nội dung đổi. Dùng scale trên phần tử con ảo để không đè lên
   `transform` đang mang toạ độ chiếu từ thế giới 3D. */
.prompt.pop > span {
  animation: pop 0.22s ease;
}

@keyframes pop {
  0% {
    transform: scale(0.7);
  }
  60% {
    transform: scale(1.08);
  }
  100% {
    transform: scale(1);
  }
}
</style>
