import * as THREE from 'three'
import type { PetDef } from '../../types'
import { PALETTE, blobShadowMaterial, toon } from '../Materials'
import { roundedBox } from './geometry'
import { addOutlines } from '../Outline'

/**
 * Rig tối giản: chỉ đủ các khớp cần cho chu kỳ đi bộ và animation làm việc.
 * Không dùng skinned mesh — xoay trực tiếp Object3D là đủ cho low-poly.
 */
export interface Rig {
  root: THREE.Group
  /** Nhóm chứa toàn bộ thân, dùng để nhún khi đi. */
  bob: THREE.Group
  head: THREE.Object3D
  armL?: THREE.Object3D
  armR?: THREE.Object3D
  legs: THREE.Object3D[]
  tail?: THREE.Object3D
  /** Ổ cắm để gắn dụng cụ vào tay phải. */
  toolSocket?: THREE.Object3D
}

/**
 * Mọi khối của nhân vật đều bo góc. Bán kính bo tỉ lệ với cạnh ngắn nhất để khối
 * nhỏ (mũi, mắt) không bị bo thành viên bi mất hình.
 */
function box(w: number, h: number, d: number, color: number, round = 0.3): THREE.Mesh {
  const r = Math.min(w, h, d) * round
  const mesh = new THREE.Mesh(roundedBox(w, h, d, r), toon(color))
  mesh.castShadow = true
  return mesh
}

/** Bóng tròn mờ dưới chân, tách khỏi shadow map để luôn thấy rõ vật thể. */
function blobShadow(size: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), blobShadowMaterial())
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.02
  mesh.renderOrder = 1
  // Bóng giả là mặt phẳng mờ; viền quanh nó thành một khung vuông đen lơ lửng.
  mesh.userData.noOutline = true
  return mesh
}

export function buildPlayerRig(): Rig {
  const root = new THREE.Group()
  root.name = 'player'
  root.add(blobShadow(1.1))

  const bob = new THREE.Group()
  root.add(bob)

  // Thân là MỘT khối tròn duy nhất, không chia ngực/bụng/hông. Nhân vật kiểu
  // cozy đọc ra được nhờ bóng dáng tổng thể và nét mực, nên càng ít mảnh càng
  // rõ; chia nhỏ ra chỉ thêm nét thừa cắt ngang người.
  const body = box(0.54, 0.78, 0.46, PALETTE.shirt, 0.48)
  body.position.y = 0.46
  bob.add(body)

  const belt = box(0.57, 0.09, 0.49, PALETTE.hair, 0.3)
  belt.position.y = 0.34
  bob.add(belt)

  const headGroup = new THREE.Group()
  headGroup.position.y = 0.88
  bob.add(headGroup)

  const head = box(0.4, 0.3, 0.38, PALETTE.skin, 0.45)
  headGroup.add(head)

  // Mũ cố tình to quá khổ: đây là chi tiết duy nhất phá vỡ bóng dáng hình trứng,
  // nên nó gánh toàn bộ việc nhận diện nhân vật từ phía sau.
  const crown = new THREE.Mesh(
    new THREE.CylinderGeometry(0.27, 0.31, 0.24, 14),
    toon(PALETTE.hat),
  )
  crown.position.y = 0.26
  crown.castShadow = true
  headGroup.add(crown)

  const brim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.46, 0.05, 18),
    toon(PALETTE.hat),
  )
  brim.position.y = 0.15
  brim.castShadow = true
  headGroup.add(brim)

  const mkArm = (side: number) => {
    const pivot = new THREE.Group()
    pivot.position.set(side * 0.29, 0.66, 0)
    const arm = box(0.15, 0.32, 0.16, PALETTE.shirt, 0.48)
    arm.position.y = -0.16
    pivot.add(arm)
    bob.add(pivot)
    return pivot
  }
  const armL = mkArm(-1)
  const armR = mkArm(1)

  const toolSocket = new THREE.Group()
  toolSocket.position.set(0, -0.3, 0.06)
  armR.add(toolSocket)

  const mkLeg = (side: number) => {
    const pivot = new THREE.Group()
    pivot.position.set(side * 0.13, 0.2, 0)
    const leg = box(0.17, 0.22, 0.19, PALETTE.pants, 0.46)
    leg.position.y = -0.11
    pivot.add(leg)
    bob.add(pivot)
    return pivot
  }

  const rig: Rig = {
    root,
    bob,
    head: headGroup,
    armL,
    armR,
    legs: [mkLeg(-1), mkLeg(1)],
    toolSocket,
  }
  addOutlines(root, 0.026)
  return rig
}

export function buildPetRig(def: PetDef): Rig {
  const root = new THREE.Group()
  root.name = `pet:${def.id}`
  root.scale.setScalar(def.scale)
  root.add(blobShadow(0.85))

  const bob = new THREE.Group()
  root.add(bob)

  const bodyMat = toon(def.bodyColor)
  const bellyMat = toon(def.bellyColor)

  // Ba dáng thân chỉ khác nhau ở tỉ lệ khối — đủ để nhận ra từng loài.
  const dims: Record<PetDef['body'], [number, number, number, number]> = {
    round: [0.46, 0.4, 0.46, 0.34],
    tall: [0.36, 0.56, 0.36, 0.46],
    long: [0.4, 0.34, 0.62, 0.3],
  }
  const [bw, bh, bd, bodyY] = dims[def.body]!

  const body = new THREE.Mesh(roundedBox(bw, bh, bd, Math.min(bw, bh, bd) * 0.42), bodyMat)
  body.position.y = bodyY
  body.castShadow = true
  bob.add(body)

  const belly = new THREE.Mesh(roundedBox(bw * 0.6, bh * 0.55, 0.05, 0.02), bellyMat)
  belly.position.set(0, bodyY - bh * 0.08, bd / 2 + 0.01)
  bob.add(belly)

  const headGroup = new THREE.Group()
  headGroup.position.set(0, bodyY + bh * 0.5 + 0.14, def.body === 'long' ? bd * 0.34 : 0.04)
  bob.add(headGroup)

  const head = new THREE.Mesh(roundedBox(0.38, 0.34, 0.36, 0.14), bodyMat)
  head.castShadow = true
  headGroup.add(head)

  const snout = new THREE.Mesh(roundedBox(0.17, 0.13, 0.11, 0.045), bellyMat)
  snout.position.set(0, -0.05, 0.21)
  headGroup.add(snout)

  const eyeMat = toon(0x24201c)
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.042, 7, 5), eyeMat)
    eye.position.set(side * 0.1, 0.05, 0.18)
    headGroup.add(eye)
  }

  if (def.ears === 'long') {
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(roundedBox(0.09, 0.3, 0.07, 0.032), bodyMat)
      ear.position.set(side * 0.11, 0.28, -0.02)
      ear.rotation.z = side * 0.22
      ear.castShadow = true
      headGroup.add(ear)
    }
  } else if (def.ears === 'horn') {
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), toon(def.bellyColor))
      horn.position.set(side * 0.1, 0.24, 0)
      horn.rotation.z = side * 0.3
      horn.castShadow = true
      headGroup.add(horn)
    }
  }

  const legs: THREE.Object3D[] = []
  const legY = bodyY - bh * 0.4
  for (const [sx, sz] of [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ] as const) {
    const pivot = new THREE.Group()
    pivot.position.set(sx * bw * 0.32, legY, sz * bd * 0.3)
    const leg = new THREE.Mesh(roundedBox(0.11, legY, 0.11, 0.045), bodyMat)
    leg.position.y = -legY / 2
    leg.castShadow = true
    pivot.add(leg)
    bob.add(pivot)
    legs.push(pivot)
  }

  const tail = new THREE.Group()
  tail.position.set(0, bodyY + 0.04, -bd / 2)
  const tailMesh = new THREE.Mesh(roundedBox(0.09, 0.09, 0.24, 0.04), bodyMat)
  tailMesh.position.z = -0.11
  tail.add(tailMesh)
  bob.add(tail)

  const rig: Rig = { root, bob, head: headGroup, legs, tail }
  addOutlines(root, 0.022)
  return rig
}

/**
 * Chu kỳ đi bộ dùng chung. `speed01` = 0 khi đứng yên, 1 khi chạy hết tốc.
 */
export function animateWalk(rig: Rig, phase: number, speed01: number, t: number): void {
  const swing = Math.sin(phase) * 0.8 * speed01
  const counter = Math.sin(phase + Math.PI) * 0.8 * speed01

  if (rig.legs.length === 2) {
    rig.legs[0]!.rotation.x = swing
    rig.legs[1]!.rotation.x = counter
  } else {
    // Bốn chân: chéo nhau như động vật thật.
    rig.legs[0]!.rotation.x = swing
    rig.legs[3]!.rotation.x = swing
    rig.legs[1]!.rotation.x = counter
    rig.legs[2]!.rotation.x = counter
  }

  if (rig.armL) rig.armL.rotation.x = counter * 0.7
  if (rig.armR) rig.armR.rotation.x = swing * 0.7

  rig.bob.position.y = Math.abs(Math.sin(phase)) * 0.05 * speed01
  // Thở nhẹ khi đứng yên để nhân vật không trông như tượng.
  rig.bob.scale.y = 1 + Math.sin(t * 2.4) * 0.014 * (1 - speed01)
  if (rig.tail) rig.tail.rotation.y = Math.sin(t * 4 + phase) * 0.35
  rig.head.rotation.z = Math.sin(phase * 0.5) * 0.04 * speed01
}
