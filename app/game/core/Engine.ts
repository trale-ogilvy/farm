import type { JobKind, PlayerState, ToolKind, WorldSnapshot } from '../types'
import { DEFAULT_GEN, Grid, clearSpawnArea, generateWorld } from '../world/Grid'
import { SceneManager } from '../render/SceneManager'
import { Player } from '../entities/Player'
import { FarmActions } from '../systems/FarmActions'
import { CropSystem } from '../systems/CropSystem'
import { PetSystem } from '../systems/PetSystem'
import { CatchSystem } from '../systems/CatchSystem'
import { resolveAction, type ActionAnim, type ActionTarget } from '../systems/ContextAction'
import { CROP_IDS, cropDef } from '../data/crops'
import { EventBus } from './EventBus'
import { GameClock, DAY_LENGTH_MS } from './Time'
import { Input } from './Input'

/** Tầm với của dụng cụ tính bằng ô. Ngoài tầm thì tự đánh vào ô trước mặt. */
const REACH = 3.2

const TOOL_ORDER: ToolKind[] = ['hoe', 'wateringCan', 'seedBag', 'scythe', 'axe', 'ball']

/** Tốc độ xoay camera bằng phím, quy đổi sang "pixel kéo chuột" mỗi frame. */
const KEY_TURN_SPEED = 7

/** Sau ngần này ms không động chuột thì coi như đang chơi bằng bàn phím. */
const MOUSE_IDLE_MS = 2000

/** Animation ứng với từng dụng cụ, dùng cho lối chơi bằng chuột. */
const ANIM_BY_TOOL: Record<ToolKind, ActionAnim> = {
  hoe: 'swing',
  axe: 'swing',
  scythe: 'harvest',
  wateringCan: 'water',
  seedBag: 'plant',
  ball: 'throw',
}

/** Dữ liệu bong bóng hành động gửi cho lớp UI mỗi frame. */
export interface ActionPrompt {
  visible: boolean
  label: string
  enabled: boolean
  /** Toạ độ pixel trên canvas. */
  x: number
  y: number
}

// v4: bản đồ đổi từ lưới phẳng 48×48 sang địa hình có độ cao 72×72. Toạ độ ô
// trong save cũ trỏ sang chỗ khác hẳn, nên phải bỏ chứ không thể nâng cấp.
export const SAVE_VERSION = 4

function defaultPlayerState(x: number, z: number): PlayerState {
  return {
    x,
    z,
    facing: 0,
    tool: 'hoe',
    selectedSeed: 'turnip',
    coins: 120,
    energy: 100,
    maxEnergy: 100,
    water: 20,
    maxWater: 20,
    inventory: [
      { id: 'seed:turnip', count: 15 },
      { id: 'seed:carrot', count: 8 },
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
  private hovered: { x: number; z: number } | null = null
  private target: ActionTarget | null = null
  private mouseIdle = MOUSE_IDLE_MS
  private promptSink: ((p: ActionPrompt) => void) | null = null
  private prompt: ActionPrompt = { visible: false, label: '', enabled: true, x: 0, y: 0 }
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
    }

    this.scene.followTarget(
      this.player.state.x,
      this.grid.groundY(this.player.state.x, this.player.state.z),
      this.player.state.z,
      dt,
    )
    this.scene.updateLighting(this.clock.daylight, this.clock.hour, this.elapsedSeconds)
    this.scene.render()

    this.input.endFrame()
  }

  /** Sang ngày mới: hồi sức, đất khô bớt, pet nghỉ đủ. */
  private rollOverDay(): void {
    const day = this.clock.day
    if (day === this.lastDay) return
    this.lastDay = day

    this.player.state.energy = this.player.state.maxEnergy
    for (const pet of this.pets.owned) pet.stamina = pet.maxStamina
    this.bus.emit('player:changed', undefined)
    this.bus.emit('pets:changed', undefined)
    this.bus.emit('toast', { text: `Ngày ${day} bắt đầu — đã hồi đầy sức`, kind: 'good' })
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

    for (let i = 0; i < TOOL_ORDER.length; i++) {
      if (input.justPressed(`Digit${i + 1}`)) this.setTool(TOOL_ORDER[i]!)
    }
    if (input.justPressed('BracketLeft')) this.cycleSeed(-1)
    if (input.justPressed('BracketRight')) this.cycleSeed(1)
    if (input.justPressed('KeyR')) this.eat()
    if (input.justPressed('Tab')) this.bus.emit('ui:open', 'pets')

    // Mục tiêu ngữ cảnh tính lại mỗi frame: người chơi xoay người là đổi mục
    // tiêu ngay, không có độ trễ.
    this.target = resolveAction(this.grid, this.player, this.pets, now)
    this.updatePrompt()
    this.applyHighlight()

    if (input.justPressed('KeyF')) {
      this.contextAction()
      return
    }

    this.mouseIdle = input.pointerMoved || input.primaryJustDown ? 0 : this.mouseIdle + dt
    this.hovered = this.scene.pickTile(input.pointer.x, input.pointer.y, input.pointerMoved)

    const wantsAct = input.primaryJustDown || input.justPressed('Space')
    if (!wantsAct) return

    const target = this.resolveTarget()
    const tool = this.player.state.tool

    if (tool === 'ball') {
      const aim = this.hovered ?? target
      this.catcher.throwAt(this.player, aim.x, aim.z)
      return
    }

    this.player.faceTowards(target.x, target.z)
    const result = this.actions.perform(tool, target.x, target.z, this.player)
    if (result.ok) {
      this.player.playAction(ANIM_BY_TOOL[tool])
      this.worldDirty = true
    } else if (result.reason) {
      this.bus.emit('toast', { text: result.reason, kind: 'bad' })
    }
  }

  /**
   * Ô sẽ bị tác động khi bấm chuột trái / Space.
   *
   * Chuột đứng yên quá lâu thì toạ độ hover chỉ là tàn dư của lần rê cuối —
   * lúc đó phải quay về ô trước mặt, nếu không Space sẽ tác động vào một chỗ
   * cách đó cả màn hình.
   */
  private resolveTarget(): { x: number; z: number } {
    if (this.hovered && this.mouseIdle < MOUSE_IDLE_MS) {
      const d = Math.hypot(
        this.hovered.x - this.player.state.x,
        this.hovered.z - this.player.state.z,
      )
      if (d <= REACH) return this.hovered
    }
    return this.player.frontTile()
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
   * Làm việc trước mặt. Một phím cho mọi thao tác: ô quyết định việc, không
   * phải người chơi chọn dụng cụ.
   */
  contextAction(): void {
    const target = this.target
    if (!target) return

    // Xoay mặt về mục tiêu TRƯỚC, kể cả khi hành động bất thành — nhân vật quay
    // lưng vào thứ mình vừa bấm là thứ đọc ra ngay là sai.
    this.player.faceTowards(target.x, target.z)

    if (!target.enabled) {
      if (target.reason) this.bus.emit('toast', { text: target.reason, kind: 'bad' })
      return
    }

    if (target.kind === 'catch') {
      const pet = target.petUid ? this.pets.byUid(target.petUid) : null
      if (pet) this.catcher.throwAt(this.player, pet.x, pet.z)
      return
    }

    if (!target.tile) return
    const result = this.actions.perform(target.tool, target.tile.x, target.tile.z, this.player)
    if (result.ok) {
      this.player.playAction(target.anim, target.tool)
      this.worldDirty = true
    } else if (result.reason) {
      this.bus.emit('toast', { text: result.reason, kind: 'bad' })
    }
  }

  /**
   * Làm sáng vật thể sắp bị tác động. Pet đi đường riêng vì nó gồm cả chục khối
   * rời, không phủ được một lớp màng duy nhất như vật thể instanced.
   */
  private applyHighlight(): void {
    const t = this.target
    this.pets.setHighlight(t?.kind === 'catch' ? t.petUid : null)

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
      this.scene.setHighlight({ kind: 'prop', propKind: tile.prop, ...at })
    } else if (tile.crop && (t.kind === 'harvest' || t.kind === 'water')) {
      // Tưới và thu hoạch đều nhắm vào CÂY, không phải mảng đất dưới nó.
      this.scene.setHighlight({
        kind: 'crop',
        cropKey: `${tile.crop.typeId}:${tile.crop.stage}`,
        ...at,
      })
    } else {
      this.scene.setHighlight({ kind: 'plot', ...at })
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
    }
    this.promptSink?.(p)
  }

  setTool(tool: ToolKind): void {
    this.player.setTool(tool)
    this.bus.emit('player:changed', undefined)
  }

  cycleSeed(dir: number): void {
    const owned = CROP_IDS.filter((id) =>
      this.player.state.inventory.some((i) => i.id === `seed:${id}` && i.count > 0),
    )
    const list = owned.length > 0 ? owned : CROP_IDS
    const idx = list.indexOf(this.player.state.selectedSeed)
    const next = list[(idx + dir + list.length) % list.length]!
    this.player.state.selectedSeed = next
    this.bus.emit('player:changed', undefined)
    this.bus.emit('toast', { text: `Hạt: ${cropDef(next).name}`, kind: 'info' })
  }

  selectSeed(id: string): void {
    this.player.state.selectedSeed = id
    this.bus.emit('player:changed', undefined)
  }

  /** Ăn nông sản để hồi sức giữa ngày. */
  eat(): void {
    const state = this.player.state
    const food = state.inventory.find(
      (i) => CROP_IDS.includes(i.id) && i.count > 0,
    )
    if (!food) {
      this.bus.emit('toast', { text: 'Không có gì để ăn', kind: 'bad' })
      return
    }
    if (state.energy >= state.maxEnergy) {
      this.bus.emit('toast', { text: 'Đang khoẻ mà', kind: 'info' })
      return
    }
    const def = cropDef(food.id)
    food.count -= 1
    state.energy = Math.min(state.maxEnergy, state.energy + 18)
    this.bus.emit('player:changed', undefined)
    this.bus.emit('toast', { text: `Ăn ${def.name}, +18 sức`, kind: 'good' })
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
        t.crop !== null
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
      })
    }

    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      gameTime: this.clock.elapsed,
      player: {
        ...this.player.state,
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
      tile.crop = saved.crop
    }

    Object.assign(this.player.state, snap.player)
    this.player.setTool(snap.player.tool)
    this.pets.loadFrom(snap.pets)

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
