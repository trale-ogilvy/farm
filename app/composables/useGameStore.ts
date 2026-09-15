import { computed, reactive, ref, shallowRef } from 'vue'
import type { Engine } from '~/game/core/Engine'
import type { InventoryItem, JobKind, PetDef, ToolKind } from '~/game/types'
import { petDef } from '~/game/data/pets'
import { TOOL_IDS, isTool, itemInfo } from '~/game/data/items'

export interface PetView {
  uid: string
  name: string
  defId: string
  def: PetDef
  job: JobKind
  state: string
  level: number
  stamina: number
  maxStamina: number
}

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'good' | 'bad'
}

export type Panel = 'none' | 'pets' | 'shop' | 'pokedex' | 'backpack'

/**
 * Trạng thái UI phản chiếu từ engine. Cố ý KHÔNG để Vue theo dõi dữ liệu game
 * thật: engine chạy 60fps trên object thuần, mỗi khi có gì đáng hiện lên màn
 * hình nó bắn event và ta chép sang đây. Nếu bọc reactive() quanh state engine,
 * mọi lần ghi toạ độ đều kích hoạt effect và tụt khung hình.
 */
const engineRef = shallowRef<Engine | null>(null)

const hud = reactive({
  coins: 0,
  energy: 100,
  maxEnergy: 100,
  water: 0,
  maxWater: 20,
  tool: 'hoe' as ToolKind,
  quickSlots: [] as Array<ToolKind | null>,
  selectedSeed: 'turnip',
  inventory: [] as InventoryItem[],
})

const pets = ref<PetView[]>([])
const clockText = ref('06:00')
const day = ref(1)
const isNight = ref(false)
const panel = ref<Panel>('none')
/** Bảng chọn hạt nằm ngoài `panel`: nó nhỏ, ở góc, và mở chồng lên ba lô được. */
const seedPicker = ref(false)
/** Số luống trống — quyết định bảng chọn hạt còn cho chọn hay không. */
const emptyPlots = ref(0)
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const backend = ref<'firebase' | 'local'>('local')
const ready = ref(false)
const toasts = ref<Toast[]>([])

let toastId = 0

export function useGameStore() {
  const engine = engineRef

  function attach(next: Engine) {
    engineRef.value = next
    syncPlayer()
    syncPets()
    syncClock()

    next.bus.on('player:changed', syncPlayer)
    next.bus.on('pets:changed', syncPets)
    next.bus.on('time:changed', syncClock)
    next.bus.on('catch:result', syncPets)
    next.bus.on('ui:open', (p) => {
      panel.value = panel.value === p ? 'none' : p
    })
    next.bus.on('ui:seedPicker', () => {
      seedPicker.value = true
    })
    // Esc đóng từ trong ra ngoài: bảng chọn hạt trước, rồi mới tới bảng lớn.
    next.bus.on('ui:escape', () => {
      if (seedPicker.value) seedPicker.value = false
      else if (panel.value !== 'none') panel.value = 'none'
    })
    next.bus.on('toast', ({ text, kind }) => pushToast(text, kind ?? 'info'))
    ready.value = true
  }

  function detach() {
    engineRef.value = null
    ready.value = false
    pets.value = []
    toasts.value = []
    seedPicker.value = false
    panel.value = 'none'
  }

  function syncPlayer() {
    const e = engineRef.value
    if (!e) return
    const s = e.player.state
    hud.coins = s.coins
    hud.energy = s.energy
    hud.maxEnergy = s.maxEnergy
    hud.water = s.water
    hud.maxWater = s.maxWater
    hud.tool = s.tool
    hud.quickSlots = [...s.quickSlots]
    hud.selectedSeed = s.selectedSeed
    emptyPlots.value = e.emptyPlots()
    // Gieo hết ruộng thì bảng chọn hạt không còn việc gì để làm.
    if (emptyPlots.value === 0) seedPicker.value = false
    // Chép mảng để Vue thấy tham chiếu mới; danh sách túi đồ rất ngắn.
    hud.inventory = s.inventory.filter((i) => i.count > 0).map((i) => ({ ...i }))
  }

  function syncPets() {
    const e = engineRef.value
    if (!e) return
    pets.value = e.pets.owned.map((p) => ({
      uid: p.uid,
      name: p.name,
      defId: p.defId,
      def: petDef(p.defId),
      job: p.job,
      state: p.state,
      level: p.level,
      stamina: p.stamina,
      maxStamina: p.maxStamina,
    }))
  }

  function syncClock() {
    const e = engineRef.value
    if (!e) return
    clockText.value = e.clock.formatClock()
    day.value = e.clock.day
    isNight.value = e.clock.isNight
  }

  function pushToast(text: string, kind: Toast['kind']) {
    const id = ++toastId
    toasts.value = [...toasts.value.slice(-4), { id, text, kind }]
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, 2600)
  }

  /** Cập nhật thanh sức/nước liên tục — các giá trị này đổi mỗi frame. */
  function pollVitals() {
    const e = engineRef.value
    if (!e) return
    hud.energy = e.player.state.energy
    hud.water = e.player.state.water
    if (panel.value === 'pets') {
      for (const view of pets.value) {
        const live = e.pets.byUid(view.uid)
        if (live) {
          view.stamina = live.stamina
          view.state = live.state
        }
      }
    }
  }

  const seedCounts = computed(() => {
    const map: Record<string, number> = {}
    for (const item of hud.inventory) {
      if (item.id.startsWith('seed:')) map[item.id.slice(5)] = item.count
    }
    return map
  })

  const ballCount = computed(
    () => hud.inventory.find((i) => i.id === 'ball')?.count ?? 0,
  )

  const harvestCount = computed(() =>
    hud.inventory
      .filter((i) => !i.id.startsWith('seed:') && i.id !== 'ball')
      .reduce((sum, i) => sum + i.count, 0),
  )

  /** Ba lô gom dụng cụ (luôn có đủ bộ) với vật phẩm đếm được trong túi. */
  const backpackItems = computed(() => {
    const counts = new Map(hud.inventory.map((i) => [i.id, i.count]))
    const tools = TOOL_IDS.map((id) => ({
      ...itemInfo(id),
      count: counts.get(id) ?? null,
      tool: id,
    }))
    const rest = hud.inventory
      .filter((i) => !isTool(i.id))
      .map((i) => ({ ...itemInfo(i.id), count: i.count, tool: null }))
    return [...tools, ...rest]
  })

  return {
    engine,
    hud,
    backpackItems,
    pets,
    clockText,
    day,
    isNight,
    panel,
    seedPicker,
    emptyPlots,
    saveState,
    backend,
    ready,
    toasts,
    seedCounts,
    ballCount,
    harvestCount,
    attach,
    detach,
    syncPlayer,
    syncPets,
    pollVitals,
    pushToast,
  }
}
