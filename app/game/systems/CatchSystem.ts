import * as THREE from 'three'
import type { EventBus } from '../core/EventBus'
import type { Grid } from '../world/Grid'
import type { PetSystem } from './PetSystem'
import type { Player } from '../entities/Player'
import { catchChance, petDef } from '../data/pets'
import { toon } from '../render/Materials'

const GRAVITY = 22
const HIT_RADIUS = 0.62
const MAX_THROW = 9
const COOLDOWN_MS = 500

interface Ball {
  mesh: THREE.Mesh
  vx: number
  vy: number
  vz: number
  age: number
  /** Điểm ném, để tính tầm xa khi chạm pet — ném càng xa càng khó trúng. */
  originX: number
  originZ: number
}

/**
 * Ném bóng để bắt pet. Quỹ đạo là parabol thật (không phải tween thẳng) nên
 * người chơi phải canh khoảng cách — đó là toàn bộ "kỹ năng" của cơ chế bắt.
 */
export class CatchSystem {
  private balls: Ball[] = []
  private cooldown = 0
  private geo = new THREE.SphereGeometry(0.13, 8, 6)

  constructor(
    private layer: THREE.Group,
    private pets: PetSystem,
    private bus: EventBus,
    private grid: Grid,
  ) {}

  get ready(): boolean {
    return this.cooldown <= 0
  }

  /**
   * Ném về phía một điểm trên mặt đất. Tự tính vận tốc đứng sao cho bóng rơi
   * đúng điểm đó, tạo cảm giác "ném tới đâu trúng tới đó".
   */
  throwAt(player: Player, targetX: number, targetZ: number): boolean {
    if (this.cooldown > 0) return false

    const ball = player.state.inventory.find((i) => i.id === 'ball')
    if (!ball || ball.count <= 0) {
      this.bus.emit('toast', { text: 'Hết bóng bắt pet', kind: 'bad' })
      return false
    }

    const sx = player.state.x
    const sz = player.state.z
    const sy = this.grid.groundY(sx, sz)
    let dx = targetX - sx
    let dz = targetZ - sz
    const dist = Math.hypot(dx, dz)
    if (dist < 0.001) return false

    const clamped = Math.min(dist, MAX_THROW)
    dx = (dx / dist) * clamped
    dz = (dz / dist) * clamped

    // Chọn thời gian bay theo tầm, rồi suy ra vận tốc: t tỉ lệ căn bậc hai của
    // khoảng cách cho quỹ đạo trông tự nhiên ở cả tầm gần lẫn xa.
    const flight = 0.34 + Math.sqrt(clamped) * 0.16
    const startY = sy + 0.95
    // Địa hình có dốc, nên đích đến cũng phải lấy đúng cao độ ở chỗ rơi.
    const targetY = this.grid.groundY(sx + dx, sz + dz)

    const mesh = new THREE.Mesh(this.geo, toon(0xe8e2d2))
    mesh.position.set(sx, startY, sz)
    mesh.castShadow = true
    this.layer.add(mesh)

    this.balls.push({
      mesh,
      vx: dx / flight,
      vz: dz / flight,
      vy: (targetY - startY) / flight + 0.5 * GRAVITY * flight,
      age: 0,
      originX: sx,
      originZ: sz,
    })

    ball.count -= 1
    this.cooldown = COOLDOWN_MS
    player.swing()
    player.state.facing = Math.atan2(dx, dz)
    this.bus.emit('player:changed', undefined)
    return true
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt)
    const dts = dt / 1000

    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i]!
      b.age += dt
      b.vy -= GRAVITY * dts
      b.mesh.position.x += b.vx * dts
      b.mesh.position.y += b.vy * dts
      b.mesh.position.z += b.vz * dts
      b.mesh.rotation.x += dts * 9
      b.mesh.rotation.z += dts * 6

      const groundY = this.grid.groundY(b.mesh.position.x, b.mesh.position.z)
      const hit = this.pets.nearestWild(b.mesh.position.x, b.mesh.position.z, HIT_RADIUS)
      if (hit && b.mesh.position.y < groundY + 1.2) {
        this.resolve(hit, Math.hypot(hit.x - b.originX, hit.z - b.originZ))
        this.destroy(i)
        continue
      }

      if (b.mesh.position.y <= groundY + 0.08 || b.age > 4000) {
        this.destroy(i)
      }
    }
  }

  private resolve(pet: ReturnType<PetSystem['nearestWild']>, distance: number): void {
    if (!pet) return
    const def = petDef(pet.defId)
    const chance = catchChance(def, pet.stamina / pet.maxStamina, distance)
    const success = Math.random() < chance

    if (success) {
      this.pets.tame(pet)
      this.bus.emit('catch:result', { petName: pet.name, success: true })
      this.bus.emit('toast', { text: `Đã bắt được ${pet.name}!`, kind: 'good' })
    } else {
      // Trượt thì pet choáng một nhịp rồi bỏ chạy, và mệt đi chút — lần sau dễ hơn.
      this.pets.stun(pet, 700)
      pet.stamina = Math.max(0, pet.stamina - 22)
      this.bus.emit('catch:result', { petName: pet.name, success: false })
      this.bus.emit('toast', { text: `${pet.name} thoát mất!`, kind: 'bad' })
    }
  }

  private destroy(i: number): void {
    const b = this.balls[i]!
    this.layer.remove(b.mesh)
    this.balls.splice(i, 1)
  }

  dispose(): void {
    for (let i = this.balls.length - 1; i >= 0; i--) this.destroy(i)
    this.geo.dispose()
  }
}
