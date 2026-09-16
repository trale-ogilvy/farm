import type { BuildingKind, PlayerState, JobKind, ToolKind, WorldSnapshot } from '../types'
import { DEFAULT_GEN, Grid, clearSpawnArea, generateWorld } from '../world/Grid'
import { SceneManager } from '../render/SceneManager'
import { Player } from '../entities/Player'
import { FarmActions } from '../systems/FarmActions'
import { CropSystem } from '../systems/CropSystem'
import { PetSystem } from '../systems/PetSystem'
import { CatchSystem } from '../systems/CatchSystem'
import { REACH, resolveAction, resolveTile, tileNeed, type ActionTarget, type TileNeed } from '../systems/ContextAction'
import { CROPS, CROP_IDS, cropDef } from '../data/crops'
import { buildingDef } from '../data/buildings'
import { REMOVE_TOOL, isMaterial } from '../data/items'
import { EventBus } from './EventBus'
import { GameClock, DAY_LENGTH_MS } from './Time'
import { Input } from './Input'

/** Số ô dụng cụ nhanh, cố định để khớp với dãy phím 1–6. */
export const QUICK_SLOTS = 4

/** Ô nhanh cuối cùng cố định là dụng cụ dỡ bỏ. */
const REMOVE_SLOT = QUICK_SLOTS - 1

const TOOL_ORDER: ToolKind[] = ['axe', 'ball', REMOVE_TOOL]

function defaultQuickSlots(): Array<ToolKind | null> {
  const slots: Array<ToolKind | null> = TOOL_ORDER.filter((t) => t !== REMOVE_TOOL).slice(0, REMOVE_SLOT)
  while (slots.length < REMOVE_SLOT) slots.push(null)
  slots.push(REMOVE_TOOL)
  return slots
}

/** Ép ô cuối luôn là dụng cụ dỡ bỏ và không nằm ở ô nào khác — dùng khi khôi phục save. */
function pinRemoveSlot(slots: Array<ToolKind | null>): Array<ToolKind | null> {
  const out = slots.slice(0, QUICK_SLOTS).map((t) => (t === REMOVE_TOOL ? null : t))
  while (out.length < QUICK_SLOTS) out.push(null)
  out[REMOVE_SLOT] = REMOVE_TOOL
  return out
}

/** Tốc độ xoay camera bằng phím, quy đổi sang "pixel kéo chuột" mỗi frame. */
const KEY_TURN_SPEED = 7

/** Sức làm việc mặc định: khối lượng công việc hoàn thành mỗi giây đứng xây. */
const DEFAULT_WORK = 10

/**
 * Biểu tượng nổi trên một ô đang cần người chơi: giọt nước (cây khát) hoặc
 * liềm (cây chín). Lớp UI vẽ thành nút bấm được; bấm vào là làm việc đó.
 * Toạ độ pixel cập nhật mỗi frame như bong bóng hành động.
 */
export interface TileMarker {
  x: number
  z: number
  need: TileNeed
  sx: number
  sy: number
  visible: boolean
  inRange: boolean
}

/**
 * Icon treo ngay trên ngọn cây: mầm thì sát đất, cây chín thì cao. Neo cố định
 * một độ cao thì icon của mầm lơ lửng cách cây cả gang tay, nhìn không ra là
 * của ô nào.
 */
function markerLift(grid: Grid, m: TileMarker): number {
  const crop = grid.at(m.x, m.z)?.crop
  if (!crop) return 0.4
  const def = cropDef(crop.typeId)
  const t = def.stages > 1 ? crop.stage / (def.stages - 1) : 1
  return 0.35 + t * 0.55
}

/** Dữ liệu bong bóng hành động gửi cho lớp UI mỗi frame. */
export interface ActionPrompt {
  visible: boolean
  label: string
  enabled: boolean
  /** Mục tiêu đúng nhưng ngoài tầm với — bong bóng ngả đỏ như highlight. */
  far: boolean
  /** Toạ độ pixel trên canvas. */
  x: number
  y: number
}

/**
 * Bong bóng trên bãi công trình gần nhất trong tầm: mời bấm F khi rảnh, hoặc
 * thanh tiến độ khi đang xây. Tách khỏi `ActionPrompt` vì hai thứ có thể hiện
 * cùng lúc — chuột đang chỉ vào cây trong khi nhân vật đứng cạnh một bãi.
 */
export interface BuildPrompt {
  visible: boolean
  label: string
  /** 0..1 khi đang xây; null khi chỉ đang mời. */
  progress: number | null
  x: number
  y: number
}

// v4: bản đồ đổi từ lưới phẳng 48×48 sang địa hình có độ cao 72×72. Toạ độ ô
// trong save cũ trỏ sang chỗ khác hẳn, nên phải bỏ chứ không thể nâng cấp.
// v5: đảo tròn phẳng 80×80 giữa biển — cùng lý do.
export const SAVE_VERSION = 5

function defaultPlayerState(x: number, z: number): PlayerState {
  return {
    x,
    z,
    facing: 0,
    tool: null,
    work: DEFAULT_WORK,
    quickSlots: defaultQuickSlots(),
    selectedSeed: 'carrot',
    coins: 120,
    inventory: [
      { id: 'seed:carrot', count: 12 },
      { id: 'seed:mushroom', count: 8 },
      { id: 'ball', count: 12 },
    ],
  }
}

/**
 * Điểm nối duy nhất giữa UI và gameplay. Vue chỉ chạm vào class này; mọi thứ
 * sâu hơn (three.js, máy trạng thái pet, lưới tile) đều nằm sau nó.
 */
export class Engine {
  readonly bus = new EventBus()
  readonly clock: GameClock
  readonly grid: Grid
  readonly scene: SceneManager
  readonly player: Player
  readonly pets: PetSystem
  readonly actions: FarmActions
  readonly catcher: CatchSystem

  private input: Input
  private crops = new CropSystem()
  private raf = 0
  private lastFrame = 0
  private running = false
  private worldDirty = true
  private elapsedSeconds = 0
  private lastDay = 1
  private target: ActionTarget | null = null
  private promptSink: ((p: ActionPrompt) => void) | null = null
  private markerSink: ((m: TileMarker[]) => void) | null = null
  private markers: TileMarker[] = []
  /** Lần quét ruộng gần nhất (ms thực); đất khô dần theo giờ nên phải quét lại định kỳ. */
  private markersScannedAt = -Infinity
  private prompt: ActionPrompt = { visible: false, label: '', enabled: true, far: false, x: 0, y: 0 }
  private buildSink: ((p: BuildPrompt) => void) | null = null
  private buildPrompt: BuildPrompt = { visible: false, label: '', progress: null, x: 0, y: 0 }
  /** Loại công trình đang đặt xuống bằng chuột; null = không ở chế độ đặt. */
  private buildMode: BuildingKind | null = null
  /** Bãi đang đứng xây. Chỉ có khi nhân vật đứng yên và không làm gì khác. */
  private constructing: { x: number; z: number } | null = null
  private hiddenAt = 0
  private onVisibility = () => this.handleVisibility()

  constructor(canvas: HTMLCanvasElement, snapshot?: WorldSnapshot | null) {
    this.clock = new GameClock(this.bus)
    this.grid = generateWorld(DEFAULT_GEN)

    const spawnX = Math.floor(DEFAULT_GEN.width / 2)
    const spawnZ = Math.floor(DEFAULT_GEN.height / 2) + 3
    clearSpawnArea(this.grid, spawnX, spawnZ, 1)

    this.scene = new SceneManager(canvas, this.grid)
    this.input = new Input(canvas)

    this.player = new Player(snapshot?.player ?? defaultPlayerState(spawnX, spawnZ))
    this.scene.entityLayer.add(this.player.rig.root)

    this.pets = new PetSystem(this.grid, this.bus, this.scene.entityLayer)
    this.actions = new FarmActions(this.grid, this.bus)
    this.catcher = new CatchSystem(this.scene.entityLayer, this.pets, this.bus, this.grid)

    if (snapshot) this.restore(snapshot)
    else this.pets.spawnWild(7)

    this.lastDay = this.clock.day
    this.scene.snapCameraTo(
      this.player.state.x,
      this.grid.groundY(this.player.state.x, this.player.state.z),
      this.player.state.z,
    )
    this.scene.refreshWorld(this.clock.elapsed)

    document.addEventListener('visibilitychange', this.onVisibility)
  }

  /**
   * requestAnimationFrame ngừng chạy khi tab bị ẩn, nên đồng hồ game đứng theo.
   * Quay lại tab thì cộng bù đúng khoảng thời gian thực đã trôi — nếu không,
   * người chơi mở tab khác 10 phút rồi quay về sẽ thấy cây y nguyên.
   */
  private handleVisibility(): void {
    if (document.hidden) {
      this.hiddenAt = Date.now()
      return
    }
    if (!this.hiddenAt) return
    const away = Date.now() - this.hiddenAt
    this.hiddenAt = 0
    this.lastFrame = performance.now()
    if (away < 2000) return
    this.creditElapsed(away)
  }

  /** Cộng bù thời gian vắng mặt (đổi tab hoặc đóng game), có chặn trần. */
  private creditElapsed(ms: number): number {
    const capped = Math.min(ms, DAY_LENGTH_MS * 3)
    if (capped <= 0) return 0
    this.clock.elapsed += capped
    this.crops.applyOfflineProgress(this.grid, capped, this.clock.elapsed)
    this.worldDirty = true
    this.lastDay = this.clock.day
    return capped
  }

  // ------------------------------------------------------------------- loop

  start(): void {
    if (this.running) return
    this.running = true
    this.lastFrame = performance.now()
    const tick = (now: number) => {
      if (!this.running) return
      // Chặn dt lớn khi tab bị ẩn: nhảy 30 giây trong một frame sẽ làm nhân vật
      // xuyên qua tường và cây lớn vọt.
      const dt = Math.min(64, now - this.lastFrame)
      this.lastFrame = now
      this.update(dt)
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  private update(dt: number): void {
    this.elapsedSeconds += dt / 1000
    this.clock.update(dt)
    const now = this.clock.elapsed
    this.actions.now = now

    this.handleInput(now, dt)

    this.player.update(
      dt,
      this.input,
      this.grid,
      this.elapsedSeconds,
      this.scene.rig.forward(),
      this.scene.rig.right(),
    )
    if (this.pets.update(dt, this.player, now, this.elapsedSeconds)) this.worldDirty = true
    this.catcher.update(dt)
    if (this.crops.update(dt, this.grid, now)) this.worldDirty = true

    this.rollOverDay()

    if (this.worldDirty || this.grid.dirty.size > 0) {
      this.scene.refreshWorld(now)
      this.worldDirty = false
      this.markersScannedAt = -Infinity
    }

    this.scene.followTarget(
      this.player.state.x,
      this.grid.groundY(this.player.state.x, this.player.state.z),
      this.player.state.z,
      dt,
    )
    this.scene.updateLighting(this.clock.daylight, this.clock.hour, this.elapsedSeconds)
    this.updateMarkers(now)
    this.scene.render()

    this.input.endFrame()
  }

  // ---------------------------------------------------------- biểu tượng ô

  setMarkerSink(fn: ((m: TileMarker[]) => void) | null): void {
    this.markerSink = fn
    fn?.(this.markers)
  }

  /**
   * Quét lại danh sách ô cần nhắc khi thế giới đổi hoặc mỗi nửa giây (đất khô
   * theo giờ, không ai đánh dấu dirty), rồi chiếu ra màn hình mỗi frame.
   */
  private updateMarkers(now: number): void {
    const wall = performance.now()
    if (wall - this.markersScannedAt > 500) {
      this.markersScannedAt = wall
      const list: TileMarker[] = []
      for (const tile of this.grid.tiles) {
        const need = tileNeed(tile, now)
        if (need) list.push({ x: tile.x, z: tile.z, need, sx: 0, sy: 0, visible: false, inRange: false })
      }
      this.markers = list
    }

    const px = this.player.state.x
    const pz = this.player.state.z
    const hovered = this.target?.tile ?? null
    for (const m of this.markers) {
      const s = this.scene.projectToScreen(m.x, this.grid.heights.tileHeight(m.x, m.z) + markerLift(this.grid, m), m.z)
      m.sx = s.x
      m.sy = s.y
      // Ô đang rê chuột đã có bong bóng tên việc neo cùng chỗ; hai thứ chồng
      // lên nhau thì icon bị che mà bong bóng cũng khó đọc.
      m.visible = s.visible && !(hovered && hovered.x === m.x && hovered.z === m.z)
      m.inRange = Math.hypot(m.x - px, m.z - pz) <= REACH
    }
    this.markerSink?.(this.markers)
  }

  /**
   * Bấm vào biểu tượng nổi trên một ô — cùng luật với bấm vào ô đó bằng chuột,
   * nhưng nhắm chính xác vì biểu tượng là phần tử HTML, không phải điểm trên đất.
   */
  actOnTile(x: number, z: number): void {
    const tile = this.grid.at(x, z)
    if (!tile || this.buildMode) return
    const target = resolveTile(this.grid, this.player, this.clock.elapsed, tile)
    if (!target) return
    this.performTarget(target)
  }

  /** Sang ngày mới: pet nghỉ đủ. */
  private rollOverDay(): void {
    const day = this.clock.day
    if (day === this.lastDay) return
    this.lastDay = day

    for (const pet of this.pets.owned) pet.stamina = pet.maxStamina
    this.bus.emit('pets:changed', undefined)
    this.bus.emit('toast', { text: `Ngày ${day} bắt đầu`, kind: 'good' })
  }

  // ------------------------------------------------------------------ input

  private handleInput(now: number, dt: number): void {
    const input = this.input

    if (input.wheel !== 0) this.scene.zoomBy(input.wheel * 0.01)

    // Xoay camera: giữ chuột phải kéo, hoặc Q/E cho người chơi bàn phím.
    if (input.rotateDelta.x !== 0 || input.rotateDelta.y !== 0) {
      this.scene.rotateBy(input.rotateDelta.x, input.rotateDelta.y)
    }
    const keyTurn =
      (input.isDown('KeyE') ? 1 : 0) - (input.isDown('KeyQ') ? 1 : 0)
    if (keyTurn !== 0) this.scene.rotateBy(keyTurn * KEY_TURN_SPEED, 0)

    for (let i = 0; i < QUICK_SLOTS; i++) {
      if (!input.justPressed(`Digit${i + 1}`)) continue
      const tool = this.player.state.quickSlots[i]
      // Bấm lại phím của dụng cụ đang cầm là buông ra — giống bấm vào ô đang chọn.
      if (tool) this.setTool(tool === this.player.state.tool ? null : tool)
    }
    if (input.justPressed('Tab')) this.bus.emit('ui:open', 'pets')
    if (input.justPressed('KeyI')) this.bus.emit('ui:open', 'backpack')
    if (input.justPressed('KeyB')) this.bus.emit('ui:open', 'build')
    if (input.justPressed('Escape')) {
      // Esc thoát chế độ đặt công trình trước; không có thì mới tới lượt UI.
      if (this.buildMode) this.setBuildMode(null)
      else this.bus.emit('ui:escape', undefined)
    }

    const cursor =
      input.pointerInside && !input.captured
        ? this.scene.pickGround(input.pointer.x, input.pointer.y, input.pointerMoved)
        : null

    // Đang đặt công trình: con trỏ là bản xem trước, chuột trái đặt xuống.
    // Dụng cụ tạm nghỉ — hai nghĩa cho cùng một cú bấm là thứ phải tránh.
    if (this.buildMode) {
      this.target = null
      this.updatePrompt()
      this.applyPlacementPreview(cursor)
      if (input.primaryJustDown && cursor) this.placeBuilding(cursor.x, cursor.z)
      this.updateBuild(input, dt, now)
      return
    }

    // Mục tiêu = chỗ con trỏ đang chỉ, lọc theo dụng cụ đang cầm. Tính lại mỗi
    // frame chứ không chỉ khi chuột động: nhân vật đi tới thì cùng ô đó chuyển
    // từ ngoài tầm (đỏ) sang trong tầm (vàng) mà chuột không cần nhúc nhích.
    this.target = resolveAction(this.grid, this.player, this.pets, now, cursor)
    this.updatePrompt()
    this.applyHighlight()

    // Chuột trái là lối DUY NHẤT để dùng dụng cụ: chọn ở hotbar, rồi bấm vào
    // thứ cần làm. Không có phím tắt "làm việc trước mặt" — hai lối cùng tồn
    // tại thì mục tiêu của phím và của chuột lệch nhau, và người chơi không
    // biết highlight đang nói về lối nào.
    if (input.primaryJustDown) this.useTool()

    this.updateBuild(input, dt, now)
  }

  // ------------------------------------------------------------- xây dựng

  /**
   * Cơ chế xây dựng dùng chung cho mọi công trình (xem README, mục "Xây dựng").
   *
   * Đặt xuống là tức thì và miễn phí; công sức nằm ở chỗ phải TỚI và ĐỨNG LÀM.
   * Mỗi frame đứng xây cộng `work × dt` vào `site.done`; đủ `workload` thì
   * xong. Di chuyển hay làm việc khác là dừng ngay nhưng không mất tiến độ —
   * quay lại bấm F là làm tiếp từ chỗ dở.
   */
  private updateBuild(input: Input, dt: number, now: number): void {
    const near = this.nearestSite()

    if (this.constructing) {
      const site = this.grid.at(this.constructing.x, this.constructing.z)?.site
      const moved = input.moveAxis().x !== 0 || input.moveAxis().y !== 0
      const tooFar =
        Math.hypot(this.constructing.x - this.player.state.x, this.constructing.z - this.player.state.z) > REACH
      if (!site || moved || tooFar || input.primaryJustDown) {
        this.constructing = null
      } else {
        site.done += (this.player.state.work * dt) / 1000
        if (!this.player.busy) this.player.playAction('build')
        if (site.done >= buildingDef(site.kind).workload) this.finishBuild(this.constructing.x, this.constructing.z)
      }
    } else if (near && input.justPressed('KeyF')) {
      this.constructing = { x: near.x, z: near.z }
      this.player.faceTowards(near.x, near.z)
    }

    this.updateBuildPrompt(near)
  }

  /** Bãi công trình gần nhất trong tầm với — đích của phím F. */
  private nearestSite(): { x: number; z: number } | null {
    const px = this.player.state.x
    const pz = this.player.state.z
    let best: { x: number; z: number } | null = null
    let bestD = REACH
    for (const t of this.grid.around(px, pz, REACH)) {
      if (!t.site) continue
      const d = Math.hypot(t.x - px, t.z - pz)
      if (d <= bestD) {
        bestD = d
        best = { x: t.x, z: t.z }
      }
    }
    return best
  }

  private finishBuild(x: number, z: number): void {
    const tile = this.grid.at(x, z)
    if (!tile?.site) return
    const def = buildingDef(tile.site.kind)
    switch (tile.site.kind) {
      case 'cropPlot':
        // Luống xây xong là ô đã xới — mọi luật gieo/tưới đọc `tilled` y nguyên.
        tile.tilled = true
        break
    }
    tile.building = tile.site.kind
    tile.site = null
    this.constructing = null
    this.grid.markDirty(x, z)
    this.worldDirty = true
    this.bus.emit('toast', { text: `Xây xong ${def.name}`, kind: 'good' })
    this.bus.emit('player:changed', undefined)
  }

  /**
   * Dỡ công trình sau khi người chơi đã xác nhận. Trả ô về đất trống: bãi dở,
   * công trình, luống, cây trên luống đều mất. Không hoàn lại gì — công trình
   * hiện chưa tốn vật liệu để đặt.
   */
  removeBuilding(x: number, z: number): void {
    const tile = this.grid.at(x, z)
    const kind = this.grid.removableAt(x, z)
    if (!tile || !kind) return
    if (Math.hypot(x - this.player.state.x, z - this.player.state.z) > REACH) {
      this.hintTooFar()
      return
    }
    this.player.faceTowards(x, z)
    this.player.playAction('swing')
    if (this.constructing?.x === x && this.constructing.z === z) this.constructing = null
    tile.site = null
    tile.building = null
    tile.tilled = false
    tile.crop = null
    tile.wetUntil = 0
    this.grid.markDirty(x, z)
    this.worldDirty = true
    this.bus.emit('toast', { text: `Đã dỡ ${buildingDef(kind).name}`, kind: 'info' })
    this.bus.emit('player:changed', undefined)
  }

  private placeBuilding(x: number, z: number): void {
    const kind = this.buildMode
    if (!kind) return
    if (!this.grid.canBuildAt(x, z, kind)) {
      this.bus.emit('toast', {
        text: this.grid.inBuildZone(x, z) ? 'Chỗ này không đặt được' : 'Ngoài vùng xây dựng quanh nhà',
        kind: 'bad',
      })
      return
    }
    const tile = this.grid.at(x, z)!
    tile.site = { kind, done: 0 }
    this.grid.markDirty(x, z)
    this.worldDirty = true
  }

  /** Bản xem trước khi đặt: vàng nếu đặt được, đỏ nếu không. */
  private applyPlacementPreview(cursor: { x: number; z: number } | null): void {
    this.pets.setHighlight(null)
    if (!cursor || !this.buildMode) {
      this.scene.setHighlight(null)
      return
    }
    const ok = this.grid.canBuildAt(cursor.x, cursor.z, this.buildMode)
    this.scene.setHighlight({ kind: 'plot', x: cursor.x, z: cursor.z }, ok ? 'ok' : 'far')
  }

  private updateBuildPrompt(near: { x: number; z: number } | null): void {
    const p = this.buildPrompt
    const site = near ? this.grid.at(near.x, near.z)?.site : null
    // Chuột đang chỉ vào đúng bãi này (để dỡ) thì nhường chỗ: hai bong bóng
    // cùng neo một ô sẽ đè lên nhau, và ý định của con trỏ là thứ mới hơn.
    const mouseOnIt = near && this.target?.tile?.x === near.x && this.target?.tile?.z === near.z
    if (!near || !site || mouseOnIt) {
      p.visible = false
    } else {
      const s = this.scene.projectToScreen(near.x, this.grid.heights.tileHeight(near.x, near.z) + 0.6, near.z)
      const def = buildingDef(site.kind)
      p.visible = s.visible
      p.x = s.x
      p.y = s.y
      // Chỉ "Xây": bãi cọc đã cho biết đó là gì, nhắc tên chỉ làm bong bóng dài ra.
      p.label = this.constructing ? 'Đang xây' : 'Xây'
      p.progress = this.constructing ? Math.min(1, site.done / def.workload) : null
    }
    this.buildSink?.(p)
  }

  setBuildSink(fn: ((p: BuildPrompt) => void) | null): void {
    this.buildSink = fn
    if (fn) fn(this.buildPrompt)
  }

  /** Bắt đầu / thôi đặt một loại công trình bằng chuột. */
  setBuildMode(kind: BuildingKind | null): void {
    if (this.buildMode === kind) return
    this.buildMode = kind
    this.bus.emit('build:changed', kind)
  }

  get currentBuildMode(): BuildingKind | null {
    return this.buildMode
  }

  /**
   * Đăng ký nơi nhận dữ liệu bong bóng. UI cập nhật DOM trực tiếp từ callback
   * này thay vì qua ref của Vue — nó chạy mỗi frame, mà cho Vue theo dõi thứ
   * đổi 60 lần/giây là đường thẳng tới tụt khung hình.
   */
  setPromptSink(fn: ((p: ActionPrompt) => void) | null): void {
    this.promptSink = fn
    if (!fn) return
    fn(this.prompt)
  }

  /**
   * Dùng dụng cụ đang cầm lên mục tiêu dưới con trỏ.
   *
   * Bấm vào chỗ không có mục tiêu thì không làm gì cả — kể cả khi ô đó có việc
   * cho dụng cụ KHÁC. Người chơi đã thấy nó không sáng lên khi rê qua, nên
   * không cần thêm lời nhắc.
   */
  private useTool(): void {
    if (this.target) this.performTarget(this.target)
  }

  /** Làm việc lên một mục tiêu đã giải ra — từ con trỏ hoặc từ biểu tượng ô. */
  private performTarget(target: ActionTarget): void {
    // Xoay mặt về mục tiêu TRƯỚC, kể cả khi hành động bất thành — nhân vật quay
    // lưng vào thứ mình vừa bấm là thứ đọc ra ngay là sai.
    this.player.faceTowards(target.x, target.z)

    // Ngoài tầm: highlight đã đỏ sẵn, bấm vào chỉ cần nhắc lại một câu — và
    // nhắc thưa thôi, một tràng bấm không thành một tràng toast.
    if (!target.inRange) {
      this.hintTooFar()
      return
    }

    if (!target.enabled) {
      if (target.reason) this.bus.emit('toast', { text: target.reason, kind: 'bad' })
      return
    }

    // Bấm vào luống trống là mở túi hạt cho ô đó; chọn loại là gieo xuống đúng
    // ô ấy. Mỗi cú bấm một ô — người chơi quyết định ruộng trông thế nào.
    if (target.kind === 'plant') {
      if (!target.tile) return
      this.pendingPlot = { x: target.tile.x, z: target.tile.z }
      this.bus.emit('ui:seedPicker', true)
      return
    }

    if (target.kind === 'catch') {
      const pet = target.petUid ? this.pets.byUid(target.petUid) : null
      if (pet) this.catcher.throwAt(this.player, pet.x, pet.z)
      return
    }

    // Dỡ bỏ thì hỏi trước: mất cây đang trồng hoặc công sức đã xây là thứ không
    // hoàn tác được, một cú bấm trượt không nên đủ để xảy ra.
    if (target.kind === 'remove') {
      if (!target.tile) return
      const kind = this.grid.removableAt(target.tile.x, target.tile.z)
      if (!kind) return
      const hasCrop = !!this.grid.at(target.tile.x, target.tile.z)?.crop
      this.bus.emit('ui:confirmRemove', { x: target.tile.x, z: target.tile.z, kind, hasCrop })
      return
    }

    if (!target.tile) return
    const result = this.actions.perform(target.kind, target.tile.x, target.tile.z, this.player)
    if (result.ok) {
      this.player.playAction(target.anim, target.prop)
      this.worldDirty = true
    } else if (result.reason) {
      this.bus.emit('toast', { text: result.reason, kind: 'bad' })
    }
  }

  private lastFarHint = 0

  private hintTooFar(): void {
    const now = performance.now()
    if (now - this.lastFarHint < 2500) return
    this.lastFarHint = now
    this.bus.emit('toast', { text: 'Xa quá — lại gần hơn', kind: 'info' })
  }

  /**
   * Làm sáng vật thể dưới con trỏ: vàng khi với tới, đỏ khi phải lại gần.
   * Pet đi đường riêng vì nó gồm cả chục khối rời, không phủ được một lớp màng
   * duy nhất như vật thể instanced.
   */
  private applyHighlight(): void {
    const t = this.target
    const tone = t?.inRange ? 'ok' : 'far'
    this.pets.setHighlight(t?.kind === 'catch' ? t.petUid : null, tone)

    if (!t || !t.tile) {
      this.scene.setHighlight(null)
      return
    }

    const tile = this.grid.at(t.tile.x, t.tile.z)
    if (!tile) {
      this.scene.setHighlight(null)
      return
    }

    const at = { x: t.tile.x, z: t.tile.z }
    if (t.kind === 'chop' && tile.prop) {
      this.scene.setHighlight({ kind: 'prop', propKind: tile.prop, ...at }, tone)
    } else if (tile.crop && (t.kind === 'harvest' || t.kind === 'water')) {
      // Tưới và thu hoạch đều nhắm vào CÂY, không phải mảng đất dưới nó.
      this.scene.setHighlight(
        { kind: 'crop', cropKey: `${tile.crop.typeId}:${tile.crop.stage}`, ...at },
        tone,
      )
    } else {
      this.scene.setHighlight({ kind: 'plot', ...at }, tone)
    }
  }

  private updatePrompt(): void {
    const t = this.target
    const p = this.prompt
    if (!t) {
      p.visible = false
    } else {
      const s = this.scene.projectToScreen(t.x, t.y, t.z)
      p.visible = s.visible
      p.x = s.x
      p.y = s.y
      p.label = t.label
      p.enabled = t.enabled
      p.far = !t.inRange
    }
    this.promptSink?.(p)
  }

  /**
   * Nhường bàn phím cho UI. Ba lô điều hướng bằng WASD, mà WASD cũng là phím
   * đi — không nhường thì mỗi lần chọn ô là nhân vật lại chạy sau lưng bảng.
   */
  setInputCaptured(on: boolean): void {
    this.input.captured = on
  }

  /** Cầm dụng cụ, hoặc null = buông ra tay không. */
  setTool(tool: ToolKind | null): void {
    this.player.setTool(tool)
    // Đổi đồ trên tay là bỏ dở việc đang xây — cùng luật với di chuyển.
    this.constructing = null
    this.bus.emit('player:changed', undefined)
  }

  /** Chọn hạt trong túi: gieo vào ô đang chờ rồi đóng túi. */
  selectSeed(id: string): void {
    this.player.state.selectedSeed = id
    const plot = this.pendingPlot
    this.pendingPlot = null
    if (plot && this.seedCount(id) > 0) this.sowAt(id, plot.x, plot.z)
    else this.bus.emit('player:changed', undefined)
    this.bus.emit('ui:seedPicker', false)
  }

  /** Đóng túi hạt mà không gieo (Esc, nút ✕). */
  cancelSeedPicker(): void {
    this.pendingPlot = null
    this.bus.emit('ui:seedPicker', false)
  }

  // ------------------------------------------------------------ ô dụng cụ nhanh

  /**
   * Gán dụng cụ vào ô nhanh. Chỉ nhận `ToolKind` — hạt giống và nông sản không
   * phải thứ cầm trên tay, chúng theo hành động chứ không theo lựa chọn.
   *
   * Dụng cụ đã nằm ở ô khác thì ĐỔI CHỖ chứ không nhân đôi: hai ô cùng một cái
   * cuốc chỉ tổ làm dãy phím khó nhớ.
   */
  setQuickSlot(index: number, tool: ToolKind | null): boolean {
    if (index < 0 || index >= QUICK_SLOTS) return false
    // Ô cuối là dụng cụ dỡ bỏ, cố định: không ghi đè, không gỡ, không đem đi.
    if (index === REMOVE_SLOT || tool === REMOVE_TOOL) return false
    const slots = this.player.state.quickSlots
    if (tool) {
      const old = slots.indexOf(tool)
      if (old === index) return true
      if (old >= 0) slots[old] = slots[index] ?? null
    }
    slots[index] = tool
    this.bus.emit('player:changed', undefined)
    return true
  }

  /** Đặt dụng cụ vào ô trống đầu tiên; hết chỗ thì ghi đè ô đang chọn. */
  quickEquip(tool: ToolKind): void {
    const slots = this.player.state.quickSlots
    if (slots.includes(tool)) {
      this.setTool(tool)
      return
    }
    const free = slots.indexOf(null)
    const held = this.player.state.tool
    const heldIdx = held && held !== REMOVE_TOOL ? slots.indexOf(held) : 0
    const idx = free >= 0 && free !== REMOVE_SLOT ? free : Math.max(0, heldIdx)
    this.setQuickSlot(idx, tool)
    this.setTool(tool)
  }

  // ---------------------------------------------------------------- gieo hạt

  /** Ô luống vừa bấm — túi hạt đang mở cho ô này, chọn xong là gieo vào đây. */
  private pendingPlot: { x: number; z: number } | null = null

  /** Số luống đã cuốc mà chưa có cây. */
  emptyPlots(): number {
    let n = 0
    for (const t of this.grid.tiles) {
      if (t.tilled && !t.crop && !t.prop) n++
    }
    return n
  }

  seedCount(cropId: string): number {
    return this.player.state.inventory.find((i) => i.id === `seed:${cropId}`)?.count ?? 0
  }

  /**
   * Gieo một loại hạt xuống MỘT ô. Mỗi cú bấm là một ô — người chơi quyết định
   * ruộng trông thế nào, muốn xen canh thì đổi hạt giữa chừng.
   */
  sowAt(cropId: string, x: number, z: number): boolean {
    this.player.state.selectedSeed = cropId
    const result = this.actions.perform('plant', x, z, this.player)
    if (result.ok) {
      this.worldDirty = true
      this.player.playAction('plant', 'seedBag')
    } else if (result.reason) {
      this.bus.emit('toast', { text: result.reason, kind: 'bad' })
    }
    this.bus.emit('player:changed', undefined)
    return result.ok
  }

  /** Bán toàn bộ nông sản đang có. */
  sellAll(): number {
    const state = this.player.state
    let total = 0
    for (const item of state.inventory) {
      if (!CROP_IDS.includes(item.id) || item.count <= 0) continue
      total += cropDef(item.id).sellPrice * item.count
      item.count = 0
    }
    state.coins += total
    state.inventory = state.inventory.filter((i) => i.count > 0)
    this.bus.emit('player:changed', undefined)
    this.bus.emit('toast', {
      text: total > 0 ? `Bán được ${total} xu` : 'Không có gì để bán',
      kind: total > 0 ? 'good' : 'info',
    })
    return total
  }

  buySeed(cropId: string, qty = 1): boolean {
    const def = cropDef(cropId)
    const cost = def.seedPrice * qty
    if (this.player.state.coins < cost) {
      this.bus.emit('toast', { text: 'Không đủ xu', kind: 'bad' })
      return false
    }
    this.player.state.coins -= cost
    const key = `seed:${cropId}`
    const item = this.player.state.inventory.find((i) => i.id === key)
    if (item) item.count += qty
    else this.player.state.inventory.push({ id: key, count: qty })
    this.bus.emit('player:changed', undefined)
    this.bus.emit('toast', { text: `Mua ${qty} hạt ${def.name}`, kind: 'good' })
    return true
  }

  buyBalls(qty = 5): boolean {
    const cost = 25 * qty
    if (this.player.state.coins < cost) {
      this.bus.emit('toast', { text: 'Không đủ xu', kind: 'bad' })
      return false
    }
    this.player.state.coins -= cost
    const item = this.player.state.inventory.find((i) => i.id === 'ball')
    if (item) item.count += qty
    else this.player.state.inventory.push({ id: 'ball', count: qty })
    this.bus.emit('player:changed', undefined)
    this.bus.emit('toast', { text: `Mua ${qty} bóng`, kind: 'good' })
    return true
  }

  assignJob(uid: string, job: JobKind): void {
    this.pets.assignJob(uid, job)
  }

  // ----------------------------------------------------------- save / restore

  snapshot(): WorldSnapshot {
    // Chỉ lưu ô khác với bản đồ sinh từ seed; phần còn lại tái tạo lúc load.
    // Với 48×48 ô, một nông trại điển hình chỉ cần lưu vài trăm ô.
    const base = this.baseline
    const tiles: WorldSnapshot['tiles'] = []

    for (const t of this.grid.tiles) {
      const b = base.at(t.x, t.z)
      if (!b) continue
      const changed =
        t.ground !== b.ground ||
        t.tilled !== b.tilled ||
        t.prop !== b.prop ||
        t.propHp !== b.propHp ||
        t.wetUntil !== 0 ||
        t.crop !== null ||
        t.site !== null ||
        t.building !== null
      if (!changed) continue

      tiles.push({
        x: t.x,
        z: t.z,
        ground: t.ground,
        tilled: t.tilled,
        wetUntil: t.wetUntil,
        prop: t.prop,
        propHp: t.propHp,
        crop: t.crop ? { ...t.crop } : null,
        site: t.site ? { ...t.site } : null,
        building: t.building,
      })
    }

    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      gameTime: this.clock.elapsed,
      player: {
        ...this.player.state,
        quickSlots: [...this.player.state.quickSlots],
        inventory: this.player.state.inventory.map((i) => ({ ...i })),
      },
      pets: this.pets.pets.map((p) => ({ ...p })),
      tiles,
    }
  }

  private pristine: Grid | null = null

  /** Bản đồ gốc chưa ai đụng, dùng làm mốc so sánh khi lưu. */
  private get baseline(): Grid {
    if (!this.pristine) this.pristine = generateWorld(DEFAULT_GEN)
    return this.pristine
  }

  restore(snap: WorldSnapshot): void {
    this.clock.elapsed = snap.gameTime

    for (const saved of snap.tiles) {
      const tile = this.grid.at(saved.x, saved.z)
      if (!tile) continue
      tile.ground = saved.ground
      tile.tilled = saved.tilled
      tile.wetUntil = saved.wetUntil
      tile.prop = saved.prop
      tile.propHp = saved.propHp
      // Cây thuộc loại đã bị bỏ khỏi game (củ cải, cà chua, bí ngô, ngô…) thì nhổ
      // đi, còn hơn để cả nông trại không load được vì một ô.
      tile.crop = saved.crop && CROPS[saved.crop.typeId] ? saved.crop : null
      tile.site = saved.site ?? null
      // Save trước khi có `building`: luống nào cũng do xây mà ra.
      tile.building = saved.building ?? (saved.tilled ? 'cropPlot' : null)
    }

    Object.assign(this.player.state, snap.player)
    // Hạt và nông sản của loại cây không còn tồn tại cũng bỏ, cùng lý do.
    this.player.state.inventory = this.player.state.inventory.filter((i) => {
      const cropId = i.id.startsWith('seed:') ? i.id.slice(5) : i.id
      return i.id === 'ball' || isMaterial(i.id) || !!CROPS[cropId]
    })
    if (!CROPS[this.player.state.selectedSeed]) this.player.state.selectedSeed = CROP_IDS[0]!
    // Save trước khi có xây dựng chưa mang chỉ số sức làm việc.
    if (typeof this.player.state.work !== 'number') this.player.state.work = DEFAULT_WORK
    // Save trước bản có ô dụng cụ nhanh không mang theo trường này. Dựng lại
    // dãy mặc định còn hơn bắt người chơi mất cả nông trại chỉ vì thêm một
    // trường vào PlayerState.
    const slots = snap.player.quickSlots
    this.player.state.quickSlots = Array.isArray(slots)
      ? pinRemoveSlot(slots.map((t) => (t && TOOL_ORDER.includes(t) ? t : null)))
      : defaultQuickSlots()
    const tool = snap.player.tool
    this.player.setTool(tool && TOOL_ORDER.includes(tool) ? tool : null)
    // Chỉ khôi phục pet đã bắt. Đàn hoang thả lại mới mỗi lần vào game: chúng
    // không thuộc về ai, và giữ nguyên từ save thì đảo cứ mãi 9 con cũ, loài
    // thêm sau không bao giờ có chỗ để xuất hiện.
    this.pets.loadFrom(snap.pets.filter((p) => !p.wild))
    this.pets.spawnWild(7)

    // Cây vẫn lớn khi người chơi offline, nhưng ở mức chậm (xem CropSystem).
    const credited = this.creditElapsed(Math.max(0, Date.now() - snap.savedAt))
    if (credited > 60_000) {
      this.bus.emit('toast', {
        text: `Vắng mặt ${Math.round(credited / 60000)} phút — cây đã lớn thêm`,
        kind: 'info',
      })
    }

    this.worldDirty = true
    this.bus.emit('player:changed', undefined)
    this.bus.emit('pets:changed', undefined)
  }

  dispose(): void {
    this.stop()
    this.promptSink = null
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.input.dispose()
    this.catcher.dispose()
    this.scene.dispose()
    this.bus.clear()
  }
}

export { TOOL_ORDER }
