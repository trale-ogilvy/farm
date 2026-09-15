<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Engine } from '~/game/core/Engine'
import { LOCAL_SAVE_KEY, SaveManager } from '~/game/save/SaveManager'
import { useGameStore } from '~/composables/useGameStore'

const canvas = ref<HTMLCanvasElement | null>(null)
const loading = ref(true)
const loadError = ref<string | null>(null)

const store = useGameStore()
const config = useRuntimeConfig()

let engine: Engine | null = null
let saver: SaveManager | null = null
let autosaveTimer: ReturnType<typeof setInterval> | null = null
let vitalsTimer: ReturnType<typeof setInterval> | null = null

async function persist() {
  if (!engine || !saver) return
  store.saveState.value = 'saving'
  try {
    await saver.save(engine.snapshot())
    store.saveState.value = 'saved'
    setTimeout(() => {
      if (store.saveState.value === 'saved') store.saveState.value = 'idle'
    }, 1200)
  } catch {
    store.saveState.value = 'error'
  }
}

function saveBeforeLeave() {
  // beforeunload không đợi được promise, nên chỉ kịp ghi bản localStorage.
  if (!engine || !saver) return
  try {
    localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(engine.snapshot()))
  } catch {
    /* hết chỗ thì thôi, không chặn việc đóng tab */
  }
}

/**
 * Chuyển sang tab khác thì lưu ngay. `beforeunload` lo được trường hợp tải lại
 * hay đóng tab, nhưng không lo được trường hợp trình duyệt sập khi trang đang
 * chạy nền — lúc đó không event nào kịp chạy cả.
 */
function onVisibilityChange() {
  if (document.hidden) saveBeforeLeave()
}

onMounted(async () => {
  if (!canvas.value) return

  try {
    saver = new SaveManager(config.public.firebase as Record<string, string>)
    store.backend.value = await saver.init()
    const snapshot = await saver.load()

    engine = new Engine(canvas.value, snapshot)
    store.attach(engine)
    engine.start()

    // Cửa sau để debug trong console và cho test tự động: chỉ có ở bản dev.
    if (import.meta.dev) {
      ;(window as unknown as Record<string, unknown>).__farm = engine
    }

    autosaveTimer = setInterval(persist, 30_000)
    vitalsTimer = setInterval(() => store.pollVitals(), 150)
    window.addEventListener('beforeunload', saveBeforeLeave)
    document.addEventListener('visibilitychange', onVisibilityChange)
  } catch (err) {
    console.error('[game] khởi động thất bại:', err)
    loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  if (autosaveTimer) clearInterval(autosaveTimer)
  if (vitalsTimer) clearInterval(vitalsTimer)
  window.removeEventListener('beforeunload', saveBeforeLeave)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  saveBeforeLeave()
  engine?.dispose()
  engine = null
  store.detach()
})

defineExpose({ persist })
</script>

<template>
  <div class="relative h-full w-full overflow-hidden">
    <canvas ref="canvas" class="h-full w-full" />

    <Transition name="fade">
      <div
        v-if="loading"
        class="absolute inset-0 grid place-items-center bg-[#12241a] text-farm-parchment"
      >
        <div class="text-center">
          <div class="mb-4 text-4xl">🌱</div>
          <p class="text-lg tracking-wide">Đang gieo hạt…</p>
        </div>
      </div>
    </Transition>

    <div
      v-if="loadError"
      class="absolute inset-0 grid place-items-center bg-[#2a1414] p-8 text-center text-red-100"
    >
      <div>
        <p class="mb-2 text-xl font-bold">Không khởi động được game</p>
        <p class="font-mono text-sm opacity-80">{{ loadError }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-leave-active {
  transition: opacity 0.35s ease;
}
.fade-leave-to {
  opacity: 0;
}
</style>
