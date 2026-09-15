import * as THREE from 'three'
import type { EventBus } from '../core/EventBus'
import type { Grid } from '../world/Grid'
import type { Player } from '../entities/Player'
import type { JobKind, Pet, Tile } from '../types'
import { petDef, rollWildPetId } from '../data/pets'
import { cropDef, isHarvestable } from '../data/crops'
import { animateWalk, buildPetRig, type Rig } from '../render/models/character'
import { WET_DURATION } from './CropSystem'
import { addItem } from './FarmActions'
import { mulberry32 } from '../core/rng'

const MAX_WILD = 9
const WILD_RESPAWN_MS = 25_000
const FLEE_RADIUS = 4.5
const WORK_DURATION = 1100
const ARRIVE_EPS = 0.42
const STUCK_MS = 2500
/** Tìm việc mới tối đa 2 lần/giây cho mỗi pet, đủ nhạy mà không quét lưới liên tục. */
const RETARGET_COOLDOWN = 500
/** Mỗi ô làm xong tốn ngần này thể lực — pet lv1 làm ~28 ô rồi phải nghỉ. */
const STAMINA_PER_JOB = 3.5
/** Thể lực hồi mỗi giây khi nghỉ. */
const STAMINA_REGEN = 12

interface PetRuntime {
  rig: Rig
  phase: number
  retargetAt: number
  stuckFor: number
  lastX: number
  lastZ: number
}

/**
 * Quản lý toàn bộ pet: dữ liệu, mesh, và máy trạng thái AI.
 *
 * Máy trạng thái cố tình giữ phẳng (không phân cấp): mỗi frame pet ở đúng một
 * state, và mọi chuyển state đều xảy ra ở `think()`. Thêm nghề mới chỉ cần thêm
 * một nhánh trong `findJobTarget()` và một nhánh trong `completeWork()`.
 */
export class PetSystem {
  readonly pets: Pet[] = []

  private runtime = new Map<string, PetRuntime>()
  private rand = mulberry32(0xc0ffee)
  private wildTimer = 0
  private uidCounter = 0

  constructor(
    private grid: Grid,
    private bus: EventBus,
    private layer: THREE.Group,
  ) {}

  // ---------------------------------------------------------------- lifecycle

  add(pet: Pet): Pet {
    this.pets.push(pet)
    const rig = buildPetRig(petDef(pet.defId))
    rig.root.position.set(pet.x, 0, pet.z)
    this.layer.add(rig.root)
    this.runtime.set(pet.uid, {
      rig,
      phase: this.rand() * 6.28,
      retargetAt: 0,
      stuckFor: 0,
      lastX: pet.x,
      lastZ: pet.z,
    })
    return pet
  }

  remove(uid: string): void {
    const i = this.pets.findIndex((p) => p.uid === uid)
    if (i < 0) return
    this.pets.splice(i, 1)
    const rt = this.runtime.get(uid)
    if (rt) {
      this.layer.remove(rt.rig.root)
      this.runtime.delete(uid)
    }
  }

  get owned(): Pet[] {
    return this.pets.filter((p) => !p.wild)
  }

  get wild(): Pet[] {
    return this.pets.filter((p) => p.wild)
  }

  byUid(uid: string): Pet | undefined {
    return this.pets.find((p) => p.uid === uid)
  }

  newUid(): string {
    return `p${Date.now().toString(36)}${(this.uidCounter++).toString(36)}`
  }

  /** Dựng lại toàn bộ pet từ dữ liệu save. */
  loadFrom(pets: Pet[]): void {
    for (const uid of [...this.runtime.keys()]) this.remove(uid)
    for (const p of pets) this.add(p)
  }

  spawnWild(count: number): void {
    for (let i = 0; i < count; i++) {
      const spot = this.findWildSpawn()
      if (!spot) return
      const defId = rollWildPetId(this.rand)
      const def = petDef(defId)
      this.add({
        uid: this.newUid(),
        defId,
        name: def.name,
        x: spot.x,
        z: spot.z,
        facing: this.rand() * 6.28,
        state: 'wander',
        job: 'idle',
        targetTile: null,
        wanderTo: null,
        stamina: 100,
        maxStamina: 100,
        level: 1,
        exp: 0,
        wild: true,
        timer: 0,
      })
    }
  }

  private findWildSpawn(): { x: number; z: number } | null {
    for (let tries = 0; tries < 60; tries++) {
      const x = Math.floor(this.rand() * this.grid.width)
      const z = Math.floor(this.rand() * this.grid.height)
      const tile = this.grid.at(x, z)
      if (!tile || tile.ground !== 'grass' || tile.prop) continue
      if (!this.grid.isWalkable(x, z)) continue
      return { x, z }
    }
    return null
  }

  // ------------------------------------------------------------------ ai loop

  update(dt: number, player: Player, now: number, t: number): boolean {
    const dts = dt / 1000
    let worldChanged = false

    this.wildTimer += dt
    if (this.wildTimer > WILD_RESPAWN_MS) {
      this.wildTimer = 0
      if (this.wild.length < MAX_WILD) this.spawnWild(1)
    }

    for (const pet of this.pets) {
      const rt = this.runtime.get(pet.uid)
      if (!rt) continue

      if (this.think(pet, player, now, dt)) worldChanged = true
      const moved = this.steer(pet, dts, now)

      // Phát hiện kẹt: vị trí gần như không đổi dù đang cố đi tới đích.
      const delta = Math.hypot(pet.x - rt.lastX, pet.z - rt.lastZ)
      rt.lastX = pet.x
      rt.lastZ = pet.z
      if (moved && delta < 0.01 * dts * 60) {
        rt.stuckFor += dt
        if (rt.stuckFor > STUCK_MS) {
          rt.stuckFor = 0
          pet.targetTile = null
          pet.wanderTo = null
          pet.state = pet.wild ? 'wander' : 'follow'
        }
      } else {
        rt.stuckFor = 0
      }

      const speed01 = moved ? 1 : 0
      rt.phase += dts * (7 + speed01 * 4)
      rt.rig.root.position.set(pet.x, 0, pet.z)
      rt.rig.root.rotation.y = pet.facing
      animateWalk(rt.rig, rt.phase, speed01, t + rt.phase)

      // Nhấp nhô nhẹ khi đang làm việc để thấy rõ pet đang "bận".
      if (pet.state === 'work') {
        rt.rig.bob.position.y = Math.abs(Math.sin(t * 9)) * 0.09
        rt.rig.bob.rotation.x = Math.sin(t * 9) * 0.2
      } else {
        rt.rig.bob.rotation.x = 0
      }
    }

    return worldChanged
  }

  /** Quyết định state tiếp theo. Trả về true nếu có thay đổi thế giới cần vẽ lại. */
  private think(pet: Pet, player: Player, now: number, dt: number): boolean {
    const def = petDef(pet.defId)

    if (pet.state === 'stunned') {
      pet.timer -= dt
      if (pet.timer <= 0) pet.state = pet.wild ? 'flee' : 'follow'
      return false
    }

    if (pet.wild) {
      const d = Math.hypot(pet.x - player.state.x, pet.z - player.state.z)
      // Chỉ bỏ chạy khi người chơi rút bóng ra — đi ngang qua thì pet kệ.
      if (d < FLEE_RADIUS && player.state.tool === 'ball') {
        pet.state = 'flee'
        const away = Math.atan2(pet.x - player.state.x, pet.z - player.state.z)
        pet.wanderTo = this.clampToMap(
          pet.x + Math.sin(away) * 6,
          pet.z + Math.cos(away) * 6,
        )
        return false
      }
      if (pet.state === 'flee' && d >= FLEE_RADIUS * 1.6) pet.state = 'wander'
      if (pet.state !== 'flee' && (!pet.wanderTo || this.arrived(pet, pet.wanderTo))) {
        pet.state = 'wander'
        pet.wanderTo = this.pickWanderSpot(pet)
      }
      return false
    }

    // --- pet đã thuần ---

    if (pet.stamina <= 0) {
      pet.state = 'rest'
    }
    if (pet.state === 'rest') {
      pet.stamina = Math.min(pet.maxStamina, pet.stamina + (dt / 1000) * STAMINA_REGEN)
      pet.wanderTo = null
      pet.targetTile = null
      if (pet.stamina >= pet.maxStamina * 0.9) pet.state = 'follow'
      return false
    }

    if (pet.job === 'idle' || pet.job === 'follow' || !def.skills.includes(pet.job)) {
      pet.state = 'follow'
      pet.targetTile = null
      // Giữ khoảng cách: chỉ bám khi ở xa, tránh đứng đè lên người chơi.
      const d = Math.hypot(pet.x - player.state.x, pet.z - player.state.z)
      pet.wanderTo = d > 2.6 ? { x: player.state.x, z: player.state.z } : null
      return false
    }

    if (pet.state === 'work') {
      pet.timer -= dt
      if (pet.timer > 0) return false
      const changed = this.completeWork(pet, player, now)
      pet.targetTile = null
      pet.state = 'seek'
      pet.stamina = Math.max(0, pet.stamina - STAMINA_PER_JOB)
      pet.exp += 3
      if (pet.exp >= pet.level * 50) {
        pet.exp = 0
        pet.level += 1
        pet.maxStamina += 8
        this.bus.emit('toast', { text: `${pet.name} lên cấp ${pet.level}!`, kind: 'good' })
        this.bus.emit('pets:changed', undefined)
      }
      return changed
    }

    // Đang đi tới ô đã nhắm: kiểm tra ô còn hợp lệ không (người chơi có thể đã
    // tự tay làm xong trước pet).
    if (pet.targetTile) {
      const tile = this.grid.at(pet.targetTile.x, pet.targetTile.z)
      if (!tile || !this.tileNeedsJob(tile, pet.job, now)) {
        pet.targetTile = null
      } else if (this.arrived(pet, pet.targetTile)) {
        pet.state = 'work'
        pet.timer = WORK_DURATION
        pet.wanderTo = null
        pet.facing = Math.atan2(pet.targetTile.x - pet.x, pet.targetTile.z - pet.z)
        return false
      } else {
        pet.state = 'seek'
        pet.wanderTo = pet.targetTile
        return false
      }
    }

    // Chưa có việc: tìm ô gần nhất cần làm, nhưng có cooldown để khỏi quét lưới
    // mỗi frame khi nông trại đang sạch việc.
    if (now < (this.runtime.get(pet.uid)?.retargetAt ?? 0)) {
      pet.state = 'follow'
      return false
    }
    const rt = this.runtime.get(pet.uid)
    if (rt) rt.retargetAt = now + RETARGET_COOLDOWN

    const target = this.findJobTarget(pet, now)
    if (target) {
      pet.targetTile = target
      pet.wanderTo = target
      pet.state = 'seek'
    } else {
      pet.state = 'follow'
      pet.wanderTo = null
    }
    return false
  }

  private tileNeedsJob(tile: Tile, job: JobKind, now: number): boolean {
    switch (job) {
      case 'water':
        return tile.tilled && !!tile.crop && tile.wetUntil <= now
      case 'harvest':
        return !!tile.crop && isHarvestable(cropDef(tile.crop.typeId), tile.crop)
      case 'gather':
        return tile.prop === 'bush' || tile.prop === 'stump'
      default:
        return false
    }
  }

  private findJobTarget(pet: Pet, now: number): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null
    let bestD = Infinity
    for (const tile of this.grid.tiles) {
      if (!this.tileNeedsJob(tile, pet.job, now)) continue
      const d = (tile.x - pet.x) ** 2 + (tile.z - pet.z) ** 2
      if (d < bestD) {
        bestD = d
        best = { x: tile.x, z: tile.z }
      }
    }
    return best
  }

  private completeWork(pet: Pet, player: Player, now: number): boolean {
    const target = pet.targetTile
    if (!target) return false
    const tile = this.grid.at(target.x, target.z)
    if (!tile) return false

    switch (pet.job) {
      case 'water':
        tile.wetUntil = Math.max(tile.wetUntil, now + WET_DURATION)
        break
      case 'harvest': {
        if (!tile.crop) return false
        const def = cropDef(tile.crop.typeId)
        if (!isHarvestable(def, tile.crop)) return false
        addItem(player, def.id, 1)
        if (def.regrow > 0) {
          tile.crop.growth *= 0.6
          tile.crop.stage = Math.max(1, tile.crop.stage - 1)
        } else {
          tile.crop = null
        }
        this.bus.emit('player:changed', undefined)
        break
      }
      case 'gather': {
        const drop = tile.prop === 'bush' ? ['fiber', 2] : ['wood', 1]
        addItem(player, drop[0] as string, drop[1] as number)
        tile.prop = null
        tile.propHp = 0
        this.bus.emit('player:changed', undefined)
        break
      }
      default:
        return false
    }

    this.grid.markDirty(tile.x, tile.z)
    return true
  }

  // ----------------------------------------------------------------- movement

  /** Đi về phía `wanderTo`. Trả về true nếu pet đang thực sự di chuyển. */
  private steer(pet: Pet, dts: number, _now: number): boolean {
    if (!pet.wanderTo || pet.state === 'work' || pet.state === 'rest') return false

    const def = petDef(pet.defId)
    const speed = def.speed * (pet.state === 'flee' ? 1.5 : 1)
    const dx = pet.wanderTo.x - pet.x
    const dz = pet.wanderTo.z - pet.z
    const dist = Math.hypot(dx, dz)
    if (dist < ARRIVE_EPS) {
      if (pet.state !== 'seek') pet.wanderTo = null
      return false
    }

    const step = Math.min(dist, speed * dts)
    let nx = pet.x + (dx / dist) * step
    let nz = pet.z + (dz / dist) * step

    if (!this.grid.isWalkable(Math.round(nx), Math.round(nz))) {
      // Né vật cản: thử lệch 90° sang hai bên trước khi chịu thua.
      const perp = [
        { x: -dz / dist, z: dx / dist },
        { x: dz / dist, z: -dx / dist },
      ]
      let slid = false
      for (const p of perp) {
        const sx = pet.x + p.x * step
        const sz = pet.z + p.z * step
        if (this.grid.isWalkable(Math.round(sx), Math.round(sz))) {
          nx = sx
          nz = sz
          slid = true
          break
        }
      }
      if (!slid) return false
    }

    pet.x = nx
    pet.z = nz
    pet.facing = Math.atan2(dx, dz)
    return true
  }

  private arrived(pet: Pet, target: { x: number; z: number }): boolean {
    return Math.hypot(pet.x - target.x, pet.z - target.z) < ARRIVE_EPS + 0.55
  }

  private pickWanderSpot(pet: Pet): { x: number; z: number } {
    for (let i = 0; i < 12; i++) {
      const a = this.rand() * Math.PI * 2
      const r = 2 + this.rand() * 6
      const spot = this.clampToMap(pet.x + Math.cos(a) * r, pet.z + Math.sin(a) * r)
      if (this.grid.isWalkable(Math.round(spot.x), Math.round(spot.z))) return spot
    }
    return { x: pet.x, z: pet.z }
  }

  private clampToMap(x: number, z: number): { x: number; z: number } {
    return {
      x: THREE.MathUtils.clamp(x, 1, this.grid.width - 2),
      z: THREE.MathUtils.clamp(z, 1, this.grid.height - 2),
    }
  }

  // ------------------------------------------------------------------- taming

  /** Pet hoang gần nhất trong bán kính, dùng để ngắm khi ném bóng. */
  nearestWild(x: number, z: number, maxDist: number): Pet | null {
    let best: Pet | null = null
    let bestD = maxDist * maxDist
    for (const pet of this.pets) {
      if (!pet.wild) continue
      const d = (pet.x - x) ** 2 + (pet.z - z) ** 2
      if (d < bestD) {
        bestD = d
        best = pet
      }
    }
    return best
  }

  tame(pet: Pet): void {
    pet.wild = false
    pet.state = 'follow'
    pet.job = 'follow'
    pet.wanderTo = null
    pet.targetTile = null
    this.bus.emit('pets:changed', undefined)
  }

  stun(pet: Pet, ms: number): void {
    pet.state = 'stunned'
    pet.timer = ms
  }

  assignJob(uid: string, job: JobKind): void {
    const pet = this.byUid(uid)
    if (!pet || pet.wild) return
    const def = petDef(pet.defId)
    if (job !== 'idle' && job !== 'follow' && !def.skills.includes(job)) {
      this.bus.emit('toast', { text: `${pet.name} không làm được việc này`, kind: 'bad' })
      return
    }
    pet.job = job
    pet.targetTile = null
    pet.wanderTo = null
    pet.state = 'follow'
    this.bus.emit('pets:changed', undefined)
  }

  release(uid: string): void {
    const pet = this.byUid(uid)
    if (!pet) return
    pet.wild = true
    pet.job = 'idle'
    pet.state = 'wander'
    this.bus.emit('pets:changed', undefined)
  }
}
