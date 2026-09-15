import * as THREE from 'three'
import type { PlayerState, ToolKind } from '../types'
import type { Grid } from '../world/Grid'
import type { Input } from '../core/Input'
import { animateWalk, buildPlayerRig, type Rig } from '../render/models/character'
import { toon, PALETTE } from '../render/Materials'
import { addOutlines } from '../render/Outline'
import type { ActionAnim } from '../systems/ContextAction'

const RADIUS = 0.3
const WALK_SPEED = 4.2
const RUN_SPEED = 6.6
const ACCEL = 26

export class Player {
  readonly rig: Rig
  readonly state: PlayerState

  /** Pha của chu kỳ đi bộ. */
  private phase = 0
  private vx = 0
  private vz = 0
  private action: { anim: ActionAnim; t: number; duration: number } | null = null
  /** Trong lúc này, hướng nhìn không bị việc di chuyển ghi đè. */
  private faceLock = 0
  /** Dụng cụ hiện TẠM theo hành động; không đụng tới lựa chọn ở hotbar. */
  private actionTool: ToolKind | null = null
  private toolMesh: THREE.Object3D | null = null
  private currentToolMeshKind: ToolKind | null = null

  constructor(state: PlayerState) {
    this.state = state
    this.rig = buildPlayerRig()
    this.rig.root.position.set(state.x, 0, state.z)
    this.syncToolMesh()
  }

  /** Thời lượng từng animation, giây. Cuốc/chặt dứt khoát, tưới thì lâu hơn. */
  private static readonly DURATION: Record<ActionAnim, number> = {
    swing: 0.5,
    water: 0.85,
    plant: 0.55,
    harvest: 0.5,
    throw: 0.45,
  }

  /**
   * Chạy animation cho một hành động, đồng thời cầm tạm đúng dụng cụ của việc
   * đó. Hotbar không đổi: người chơi bấm F là làm việc trước mặt, không phải
   * chọn dụng cụ rồi mới làm.
   */
  playAction(anim: ActionAnim, tool?: ToolKind): void {
    this.action = { anim, t: 0, duration: Player.DURATION[anim] }
    this.faceLock = Player.DURATION[anim]
    if (tool) {
      this.actionTool = tool
      this.syncToolMesh()
    }
  }

  /** Quay mặt về phía một điểm. Rig tự xoay mượt tới hướng này. */
  faceTowards(x: number, z: number): void {
    const dx = x - this.state.x
    const dz = z - this.state.z
    if (Math.hypot(dx, dz) < 0.001) return
    this.state.facing = Math.atan2(dx, dz)
  }

  get busy(): boolean {
    return this.action !== null
  }

  /**
   * `camForward` / `camRight` là hệ trục của camera chiếu xuống mặt phẳng XZ.
   * Với camera xoay tự do kiểu BotW, bấm W nghĩa là "đi về phía đang nhìn" chứ
   * không còn là "đi về -Z" — nên hướng phải do camera cấp, không hardcode.
   */
  update(
    dt: number,
    input: Input,
    grid: Grid,
    t: number,
    camForward: { x: number; z: number },
    camRight: { x: number; z: number },
  ): void {
    const dts = dt / 1000
    const axis = input.moveAxis()
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight')
    // Hết sức thì không chạy được nữa, buộc người chơi phải nghỉ/ăn.
    const maxSpeed = running && this.state.energy > 5 ? RUN_SPEED : WALK_SPEED

    // axis.y = -1 khi bấm W, nên đổi dấu để W ra hướng "tiến".
    const dirX = camRight.x * axis.x + camForward.x * -axis.y
    const dirZ = camRight.z * axis.x + camForward.z * -axis.y
    const targetVx = dirX * maxSpeed
    const targetVz = dirZ * maxSpeed

    const blend = 1 - Math.exp(-ACCEL * dts)
    this.vx += (targetVx - this.vx) * blend
    this.vz += (targetVz - this.vz) * blend

    this.moveAxisWise(grid, this.vx * dts, this.vz * dts)

    const speed = Math.hypot(this.vx, this.vz)
    const speed01 = Math.min(1, speed / WALK_SPEED)
    this.faceLock = Math.max(0, this.faceLock - dts)
    if (speed01 > 0.02) {
      this.phase += dts * (6 + speed01 * 5)
      // Đang trong animation hành động thì giữ nguyên hướng đã quay về mục tiêu,
      // nếu không nhân vật sẽ vừa cuốc vừa quay lưng lại chỗ mình đang cuốc.
      if (this.faceLock <= 0) this.state.facing = Math.atan2(this.vx, this.vz)
      if (running) this.state.energy = Math.max(0, this.state.energy - dts * 1.6)
    }

    this.rig.root.position.set(
      this.state.x,
      grid.groundY(this.state.x, this.state.z),
      this.state.z,
    )
    // Xoay mượt về hướng đi thay vì nhảy cóc.
    const cur = this.rig.root.rotation.y
    this.rig.root.rotation.y = cur + shortestAngle(cur, this.state.facing) * (1 - Math.exp(-18 * dts))

    animateWalk(this.rig, this.phase, speed01, t)

    if (this.action) {
      this.action.t += dts
      const p = Math.min(1, this.action.t / this.action.duration)
      applyActionPose(this.rig, this.action.anim, p)
      if (p >= 1) {
        this.action = null
        this.actionTool = null
        this.syncToolMesh()
        this.rig.bob.rotation.x = 0
      }
    } else {
      this.rig.bob.rotation.x = 0
    }
  }

  /**
   * Di chuyển tách từng trục để khi đâm vào tường vẫn trượt được dọc tường,
   * thay vì dính cứng tại chỗ.
   */
  private moveAxisWise(grid: Grid, dx: number, dz: number): void {
    if (dx !== 0) {
      const nx = this.state.x + dx
      if (this.canStand(grid, nx, this.state.z)) this.state.x = nx
      else this.vx = 0
    }
    if (dz !== 0) {
      const nz = this.state.z + dz
      if (this.canStand(grid, this.state.x, nz)) this.state.z = nz
      else this.vz = 0
    }
  }

  private canStand(grid: Grid, x: number, z: number): boolean {
    for (const [ox, oz] of [
      [-RADIUS, -RADIUS],
      [RADIUS, -RADIUS],
      [-RADIUS, RADIUS],
      [RADIUS, RADIUS],
    ] as const) {
      if (!grid.isWalkable(Math.round(x + ox), Math.round(z + oz))) return false
    }
    return true
  }

  /** Ô ngay trước mặt người chơi — đích mặc định khi không rê chuột. */
  frontTile(): { x: number; z: number } {
    return {
      x: Math.round(this.state.x + Math.sin(this.state.facing)),
      z: Math.round(this.state.z + Math.cos(this.state.facing)),
    }
  }

  setTool(tool: ToolKind): void {
    this.state.tool = tool
    this.syncToolMesh()
  }

  private syncToolMesh(): void {
    const want = this.actionTool ?? this.state.tool
    if (this.currentToolMeshKind === want) return
    this.currentToolMeshKind = want
    if (this.toolMesh) {
      this.rig.toolSocket?.remove(this.toolMesh)
      this.toolMesh = null
    }
    const mesh = buildToolMesh(want)
    if (mesh) {
      // Dụng cụ được gắn sau khi rig đã dựng xong nên không nằm trong lượt
      // addOutlines ban đầu; phải viền riêng ở đây.
      addOutlines(mesh, 0.016)
      this.rig.toolSocket?.add(mesh)
      this.toolMesh = mesh
    }
  }
}

/**
 * Đặt dáng nhân vật theo tiến độ `p` (0..1) của một hành động.
 *
 * Chạy SAU animateWalk và ghi đè lên tay phải, nên hành động luôn thắng chu kỳ
 * đi bộ — người chơi vừa đi vừa bấm F vẫn thấy động tác rõ ràng.
 */
function applyActionPose(rig: Rig, anim: ActionAnim, p: number): void {
  const arm = rig.armR
  const walkBobY = rig.bob.position.y

  switch (anim) {
    case 'swing': {
      // Giơ lên -> bổ xuống -> thu về. Ba đoạn rời nhau để cú bổ dứt khoát,
      // thay vì một hình sin đối xứng trông như đang vẫy tay.
      let a: number
      if (p < 0.35) a = lerp(0, -1.35, p / 0.35)
      else if (p < 0.58) a = lerp(-1.35, 0.95, (p - 0.35) / 0.23)
      else a = lerp(0.95, 0, (p - 0.58) / 0.42)
      if (arm) arm.rotation.x = a
      rig.bob.rotation.x = Math.max(0, a) * 0.2
      break
    }
    case 'water': {
      // Đưa bình ra rồi GIỮ, vì nước chảy cần thời gian mới đọc ra là đang tưới.
      const reach = p < 0.2 ? p / 0.2 : p < 0.78 ? 1 : 1 - (p - 0.78) / 0.22
      if (arm) arm.rotation.x = reach * 1.0
      rig.bob.rotation.x = reach * 0.16
      break
    }
    case 'plant': {
      const arc = Math.sin(p * Math.PI)
      if (arm) arm.rotation.x = arc * 1.55
      rig.bob.rotation.x = arc * 0.3
      rig.bob.position.y = walkBobY - arc * 0.13
      break
    }
    case 'harvest': {
      // Cúi xuống nhanh, kéo lên chậm — nhịp của động tác nhổ củ.
      const down = p < 0.45 ? p / 0.45 : 1 - (p - 0.45) / 0.55
      if (arm) arm.rotation.x = down * 1.65
      rig.bob.rotation.x = down * 0.32
      rig.bob.position.y = walkBobY - down * 0.1
      break
    }
    case 'throw': {
      const a = p < 0.38 ? lerp(0, -2.1, p / 0.38) : lerp(-2.1, 0.5, (p - 0.38) / 0.62)
      if (arm) arm.rotation.x = a
      rig.bob.rotation.x = Math.max(0, -a) * 0.1
      break
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t))
}

function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/** Dụng cụ cầm tay, dựng bằng vài khối để nhìn vào là biết đang cầm gì. */
function buildToolMesh(tool: ToolKind): THREE.Object3D | null {
  const group = new THREE.Group()
  const handle = () => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.6, 5), toon(0x8a6a45))
    m.castShadow = true
    return m
  }

  switch (tool) {
    case 'hoe': {
      const h = handle()
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), toon(0x9aa0a6))
      head.position.set(0.07, -0.28, 0)
      group.add(h, head)
      break
    }
    case 'axe': {
      const h = handle()
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.04), toon(0xb8bcc2))
      blade.position.set(0.07, -0.24, 0)
      group.add(h, blade)
      break
    }
    case 'scythe': {
      const h = handle()
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.04), toon(0xd0d4d8))
      blade.position.set(0.14, -0.28, 0)
      blade.rotation.z = 0.35
      group.add(h, blade)
      break
    }
    case 'wateringCan': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.2, 7), toon(0x5aa0cf))
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.24, 5), toon(0x4e8fbb))
      spout.position.set(0.14, 0.02, 0)
      spout.rotation.z = -0.9
      body.castShadow = true
      group.add(body, spout)
      group.position.y = -0.08
      break
    }
    case 'seedBag': {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.13), toon(0xc8a86a))
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.1), toon(PALETTE.trunk))
      tie.position.y = 0.11
      bag.castShadow = true
      group.add(bag, tie)
      group.position.y = -0.08
      break
    }
    case 'ball': {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), toon(0xe8e2d2))
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.102, 0.102, 0.03, 8), toon(0xd2483c))
      band.rotation.x = Math.PI / 2
      ball.castShadow = true
      group.add(ball, band)
      group.position.y = -0.08
      break
    }
    default:
      return null
  }

  group.rotation.z = -0.3
  return group
}
