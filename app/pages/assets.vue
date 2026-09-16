<script setup lang="ts">
import type { AssetEntry } from '~~/server/api/assets.get'
import { AssetPreview, type ModelStats, type PreviewMode } from '~/game/render/AssetPreview'

/**
 * Trang xem và duyệt asset 3D (dev only): /assets
 *
 * Liệt kê mọi glTF trong `public/models`, render qua đúng pipeline của game
 * (nướng màu, toon, viền mực) để quyết định "cái này xài được không" trước khi
 * nối vào code. Nhận xét lưu ở localStorage, xuất ra JSON để dán vào ghi chú.
 */

useHead({ title: 'Duyệt asset' })

type Verdict = 'use' | 'skip' | 'maybe'
interface Review {
  verdict?: Verdict
  note?: string
}

const VERDICTS: Array<{ id: Verdict; icon: string; label: string }> = [
  { id: 'use', icon: '✅', label: 'Dùng' },
  { id: 'maybe', icon: '🤔', label: 'Xem lại' },
  { id: 'skip', icon: '❌', label: 'Bỏ' },
]

/** Ngưỡng tam giác: prop farmkit ~300–1000, cây trồng ~4k–10k. Trên đó là nặng cho instancing. */
const HEAVY_TRIS = 5000

const REVIEW_KEY = 'farm:assetReview'

const route = useRoute()
const router = useRouter()

const { data: files } = await useFetch<AssetEntry[]>('/api/assets', { default: () => [] })

const search = ref('')
const selected = ref<string | null>((route.query.m as string) || null)
const stats = ref<ModelStats | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const statsCache = new Map<string, ModelStats>()

const mode = ref<PreviewMode>('game')
const clip = ref('')
const scalePreset = ref<'1' | '0.5' | 'fit'>('1')
const outline = ref(true)
const reference = ref(true)
const autoRotate = ref(false)

const reviews = ref<Record<string, Review>>({})
const copied = ref(false)

const canvas = ref<HTMLCanvasElement | null>(null)
let preview: AssetPreview | null = null

// ---- danh sách ----

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? files.value.filter((f) => f.path.toLowerCase().includes(q)) : files.value
})

/** pack → group → files, giữ thứ tự đã sort theo path. */
const grouped = computed(() => {
  const packs = new Map<string, Map<string, AssetEntry[]>>()
  for (const f of filtered.value) {
    let groups = packs.get(f.pack)
    if (!groups) packs.set(f.pack, (groups = new Map()))
    let list = groups.get(f.group)
    if (!list) groups.set(f.group, (list = []))
    list.push(f)
  }
  return [...packs].map(([pack, groups]) => ({ pack, groups: [...groups].map(([group, list]) => ({ group, list })) }))
})

const current = computed(() => files.value.find((f) => f.path === selected.value) ?? null)
const currentReview = computed(() => (selected.value ? reviews.value[selected.value] ?? {} : {}))

const scale = computed(() => {
  if (scalePreset.value === 'fit') return stats.value ? 1 / Math.max(stats.value.footprint, 1e-3) : 1
  return Number(scalePreset.value)
})

const reviewedCount = computed(() => Object.values(reviews.value).filter((r) => r.verdict).length)

function select(path: string): void {
  selected.value = path
  router.replace({ query: { ...route.query, m: path } })
}

function step(delta: number): void {
  const list = filtered.value
  if (!list.length) return
  const i = list.findIndex((f) => f.path === selected.value)
  select(list[(i + delta + list.length) % list.length]!.path)
  reveal()
}

/** Cuộn danh sách tới model đang chọn. */
function reveal(): void {
  nextTick(() =>
    document.querySelector(`[data-path="${CSS.escape(selected.value ?? '')}"]`)?.scrollIntoView({ block: 'nearest' }),
  )
}

function kb(kb: number): string {
  return kb >= 1024 * 1024 ? `${(kb / 1024 / 1024).toFixed(1)} MB` : `${Math.round(kb / 1024)} KB`
}

function fmt(n: number): string {
  return n.toLocaleString('vi-VN')
}

/** `SK_WeaselDragon.ao|AS_WeaselDragon_Idle` → `Idle`. */
function clipLabel(name: string): string {
  return name.replace(/^.*\|AS_\w+?_/, '')
}

// ---- nhận xét ----

function setVerdict(v: Verdict): void {
  if (!selected.value) return
  const cur = reviews.value[selected.value] ?? {}
  reviews.value[selected.value] = { ...cur, verdict: cur.verdict === v ? undefined : v }
  persist()
}

function setNote(e: Event): void {
  if (!selected.value) return
  reviews.value[selected.value] = { ...(reviews.value[selected.value] ?? {}), note: (e.target as HTMLTextAreaElement).value }
  persist()
}

function persist(): void {
  try {
    localStorage.setItem(REVIEW_KEY, JSON.stringify(reviews.value))
  } catch {
    /* private mode — thôi kệ */
  }
}

async function exportReviews(): Promise<void> {
  const out = Object.entries(reviews.value)
    .filter(([, r]) => r.verdict || r.note)
    .map(([path, r]) => ({ path, ...r }))
  await navigator.clipboard.writeText(JSON.stringify(out, null, 2))
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

// ---- 3D ----

async function show(path: string): Promise<void> {
  if (!preview) return
  loading.value = true
  error.value = null
  try {
    const s = await preview.load(`/models/${path}`)
    if (s) {
      stats.value = s
      statsCache.set(path, s)
      clip.value = s.clips[0] ?? ''
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    stats.value = null
  } finally {
    loading.value = false
  }
}

watch(selected, (path) => path && show(path))
watch(clip, (name) => name && preview?.playClip(name))
watch([mode, scale, outline, reference, autoRotate], () => {
  preview?.setOptions({ mode: mode.value, scale: scale.value, outline: outline.value, reference: reference.value, autoRotate: autoRotate.value })
})

function onKey(e: KeyboardEvent): void {
  if ((e.target as HTMLElement).closest('input, textarea')) return
  if (e.key === 'ArrowDown' || e.key === 'j') step(1)
  else if (e.key === 'ArrowUp' || e.key === 'k') step(-1)
  else if (e.key === 'f') preview?.frame()
  else return
  e.preventDefault()
}

onMounted(() => {
  try {
    reviews.value = JSON.parse(localStorage.getItem(REVIEW_KEY) || '{}')
  } catch {
    reviews.value = {}
  }
  preview = new AssetPreview(canvas.value!)
  preview.setOptions({ mode: mode.value, scale: scale.value, outline: outline.value, reference: reference.value })
  if (selected.value) show(selected.value)
  else if (files.value[0]) select(files.value[0].path)
  reveal()
  window.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  preview?.dispose()
  preview = null
})
</script>

<template>
  <main class="flex h-dvh w-screen overflow-hidden bg-paper-deep text-ink select-text">
    <!-- Danh sách -->
    <aside class="flex w-72 shrink-0 flex-col border-r-2 border-ink/15 bg-paper">
      <div class="border-b-2 border-ink/10 p-3">
        <h1 class="mb-2 text-sm font-bold uppercase tracking-wide text-ink-soft">
          Asset · {{ files.length }} file · {{ reviewedCount }} đã duyệt
        </h1>
        <input
          v-model="search"
          type="search"
          placeholder="Lọc theo tên…"
          class="inset-card w-full px-3 py-1.5 text-sm outline-none focus:border-ink/40"
        />
      </div>
      <div class="flex-1 overflow-y-auto p-2 text-sm">
        <details v-for="p in grouped" :key="p.pack" open class="mb-2">
          <summary class="cursor-pointer px-1 py-1 font-bold">📦 {{ p.pack }}</summary>
          <div v-for="g in p.groups" :key="g.group" class="ml-1">
            <div v-if="g.group" class="mt-1 px-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              {{ g.group }}
            </div>
            <button
              v-for="f in g.list"
              :key="f.path"
              :data-path="f.path"
              class="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-ink/5"
              :class="{ 'bg-sage/40 font-semibold': f.path === selected }"
              @click="select(f.path)"
            >
              <span class="w-4 shrink-0 text-center">{{ VERDICTS.find((v) => v.id === reviews[f.path]?.verdict)?.icon ?? '' }}</span>
              <span class="flex-1 truncate">{{ f.name }}</span>
              <span class="shrink-0 text-xs text-ink-soft">{{ kb(f.bytes) }}</span>
            </button>
          </div>
        </details>
        <p v-if="!filtered.length" class="p-3 text-center text-ink-soft">Không có file nào khớp.</p>
      </div>
      <div class="border-t-2 border-ink/10 p-2 text-xs text-ink-soft">↑↓ hoặc j/k đổi model · f căn khung</div>
    </aside>

    <!-- Sân khấu -->
    <section class="relative min-w-0 flex-1">
      <canvas ref="canvas" class="h-full w-full" />
      <div class="paper-grain" />
      <div
        v-if="loading"
        class="panel absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 text-sm"
      >
        Đang tải…
      </div>
      <div v-else-if="error" class="panel absolute top-4 left-1/2 max-w-md -translate-x-1/2 px-4 py-2 text-sm text-red-800">
        {{ error }}
      </div>

      <div class="panel absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-wrap items-center gap-3 px-4 py-2 text-sm">
        <div class="flex overflow-hidden rounded-full border border-ink/25">
          <button
            v-for="m in (['game', 'raw'] as PreviewMode[])"
            :key="m"
            class="px-3 py-1"
            :class="mode === m ? 'bg-ink text-paper' : 'hover:bg-ink/5'"
            @click="mode = m"
          >
            {{ m === 'game' ? 'Trong game' : 'Gốc' }}
          </button>
        </div>
        <label class="flex items-center gap-1">
          Tỉ lệ
          <select v-model="scalePreset" class="inset-card px-2 py-0.5">
            <option value="1">1×</option>
            <option value="0.5">0.5× (farmkit)</option>
            <option value="fit">vừa 1 ô</option>
          </select>
        </label>
        <label v-if="stats?.clips.length" class="flex items-center gap-1">
          Clip
          <select v-model="clip" class="inset-card max-w-40 px-2 py-0.5">
            <option v-for="c in stats.clips" :key="c" :value="c">{{ clipLabel(c) }}</option>
          </select>
        </label>
        <label class="flex items-center gap-1"><input v-model="outline" type="checkbox" /> Viền</label>
        <label class="flex items-center gap-1"><input v-model="reference" type="checkbox" /> Nhân vật</label>
        <label class="flex items-center gap-1"><input v-model="autoRotate" type="checkbox" /> Xoay</label>
      </div>
    </section>

    <!-- Thông tin + nhận xét -->
    <aside class="flex w-80 shrink-0 flex-col overflow-y-auto border-l-2 border-ink/15 bg-paper p-4 text-sm">
      <template v-if="current">
        <h2 class="text-lg leading-tight font-bold break-all">{{ current.name }}</h2>
        <p class="mb-3 text-xs break-all text-ink-soft">{{ current.path }} · {{ kb(current.bytes) }}</p>

        <div v-if="stats" class="inset-card mb-3 grid grid-cols-2 gap-x-3 gap-y-1 p-3">
          <span class="text-ink-soft">Tam giác</span>
          <span class="font-semibold" :class="{ 'text-red-700': stats.tris > HEAVY_TRIS }">
            {{ fmt(stats.tris) }} <span v-if="stats.tris > HEAVY_TRIS" title="Prop farmkit chỉ 300–1000">⚠ nặng</span>
          </span>
          <span class="text-ink-soft">Đỉnh</span>
          <span>{{ fmt(stats.verts) }}</span>
          <span class="text-ink-soft">Cỡ gốc</span>
          <span>{{ stats.size.map((v) => v.toFixed(2)).join(' × ') }}</span>
          <span class="text-ink-soft">Sau tỉ lệ (ô)</span>
          <span>{{ stats.size.map((v) => (v * scale).toFixed(2)).join(' × ') }}</span>
          <span class="text-ink-soft">Mảnh</span>
          <span>{{ stats.parts.length }}</span>
          <template v-if="stats.clips.length">
            <span class="text-ink-soft">Xương / clip</span>
            <span>có · {{ stats.clips.length }} clip</span>
          </template>
        </div>

        <details v-if="stats" class="mb-3">
          <summary class="cursor-pointer font-semibold">Mảnh & màu</summary>
          <ul class="mt-1 space-y-0.5">
            <li v-for="p in stats.parts" :key="p.name" class="flex items-center gap-2">
              <span class="h-3.5 w-3.5 shrink-0 rounded-sm border border-ink/30" :style="{ background: p.color }" />
              <span class="flex-1 truncate" :title="p.name">{{ p.name }}</span>
              <span class="text-xs text-ink-soft">{{ p.hasTexture ? '🖼' : p.color }} · {{ fmt(p.tris) }}</span>
            </li>
          </ul>
        </details>

        <div class="mb-2 font-semibold">Nhận xét</div>
        <div class="mb-2 flex gap-1">
          <button
            v-for="v in VERDICTS"
            :key="v.id"
            class="flex-1 rounded-full border border-ink/25 px-2 py-1"
            :class="currentReview.verdict === v.id ? 'bg-ink text-paper' : 'hover:bg-ink/5'"
            @click="setVerdict(v.id)"
          >
            {{ v.icon }} {{ v.label }}
          </button>
        </div>
        <textarea
          :key="current.path"
          :value="currentReview.note ?? ''"
          rows="4"
          placeholder="Ghi chú: dùng cho gì, cần sửa gì…"
          class="inset-card mb-3 w-full resize-y px-3 py-2 outline-none focus:border-ink/40"
          @input="setNote"
        />
      </template>
      <p v-else class="text-ink-soft">Chọn một file bên trái.</p>

      <div class="mt-auto pt-3">
        <button class="panel w-full px-3 py-2 font-semibold hover:bg-paper-deep" @click="exportReviews">
          {{ copied ? 'Đã chép ✓' : `Chép JSON (${reviewedCount})` }}
        </button>
      </div>
    </aside>
  </main>
</template>
