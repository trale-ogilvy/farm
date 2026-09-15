import * as THREE from 'three'
import type { PlayerState, ToolKind } from '../types'
import type { Grid } from '../world/Grid'
import type { Input } from '../core/Input'
import { animateWalk, buildPlayerRig, type Rig } from '../render/models/character'
import { toon, PALETTE } from '../render/Materials'
import { addOutlines } from '../render/Outline'

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
  private swingT = 0
  private toolMesh: THREE.Object3D | null = null
  private currentToolMeshKind: ToolKind | null = null

  constructor(state: PlayerState) {
    this.state = state
    this.rig = buildPlayerRig()
    this.rig.root.position.set(state.x, 0, state.z)
    this.syncToolMesh()
  }

  /** Bắt đầu animation vung tay; ActionSystem gọi khi hành động thành công. */
  swing(): void {
    this.swingT = 0.34
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
    if (speed01 > 0.02) {
      this.phase += dts * (6 + speed01 * 5)
      this.state.facing = Math.atan2(this.vx, this.vz)
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

    if (this.swingT > 0) {
      this.swingT = Math.max(0, this.swingT - dts)
      // Vung xuống nhanh rồi về chậm: 0.34s -> 0 ánh xạ thành cung 0..1..0.
      const p = 1 - this.swingT / 0.34
      const arc = Math.sin(p * Math.PI)
      if (this.rig.armR) this.rig.armR.rotation.x = -2.2 * arc
      this.rig.bob.rotation.x = arc * 0.18
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
    if (this.currentToolMeshKind === this.state.tool) return
    this.currentToolMeshKind = this.state.tool
    if (this.toolMesh) {
      this.rig.toolSocket?.remove(this.toolMesh)
      this.toolMesh = null
    }
    const mesh = buildToolMesh(this.state.tool)
    if (mesh) {
      // Dụng cụ được gắn sau khi rig đã dựng xong nên không nằm trong lượt
      // addOutlines ban đầu; phải viền riêng ở đây.
      addOutlines(mesh, 0.016)
      this.rig.toolSocket?.add(mesh)
      this.toolMesh = mesh
    }
  }
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
