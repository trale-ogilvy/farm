import * as THREE from 'three'
import type { PetDef } from '../../types'
import { PALETTE, blobShadowMaterial, toon } from '../Materials'

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

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color))
  mesh.castShadow = true
  return mesh
}

/** Bóng tròn mờ dưới chân, tách khỏi shadow map để luôn thấy rõ vật thể. */
function blobShadow(size: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), blobShadowMaterial())
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.02
  mesh.renderOrder = 1
  return mesh
}

export function buildPlayerRig(): Rig {
  const root = new THREE.Group()
  root.name = 'player'
  root.add(blobShadow(1.0))

  const bob = new THREE.Group()
  root.add(bob)

  const torso = box(0.42, 0.42, 0.28, PALETTE.shirt)
  torso.position.y = 0.63
  bob.add(torso)

  const headGroup = new THREE.Group()
  headGroup.position.y = 0.92
  bob.add(headGroup)

  const head = box(0.38, 0.34, 0.34, PALETTE.skin)
  headGroup.add(head)

  const hair = box(0.4, 0.12, 0.36, PALETTE.hair)
  hair.position.y = 0.16
  headGroup.add(hair)

  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.26, 7), toon(PALETTE.hat))
  hat.position.y = 0.3
  hat.castShadow = true
  headGroup.add(hat)

  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 9), toon(PALETTE.hat))
  brim.position.y = 0.18
  headGroup.add(brim)

  // Mũi nhỏ để nhận ra nhân vật đang quay mặt về hướng nào.
  const nose = box(0.08, 0.08, 0.06, PALETTE.skin)
  nose.position.set(0, -0.02, 0.19)
  headGroup.add(nose)

  const mkArm = (side: number) => {
    const pivot = new THREE.Group()
    pivot.position.set(side * 0.28, 0.8, 0)
    const arm = box(0.13, 0.38, 0.13, PALETTE.skin)
    arm.position.y = -0.19
    pivot.add(arm)
    bob.add(pivot)
    return pivot
  }
  const armL = mkArm(-1)
  const armR = mkArm(1)

  const toolSocket = new THREE.Group()
  toolSocket.position.set(0, -0.36, 0.06)
  armR.add(toolSocket)

  const mkLeg = (side: number) => {
    const pivot = new THREE.Group()
    pivot.position.set(side * 0.11, 0.42, 0)
    const leg = box(0.15, 0.42, 0.15, PALETTE.pants)
    leg.position.y = -0.21
    pivot.add(leg)
    bob.add(pivot)
    return pivot
  }

  return {
    root,
    bob,
    head: headGroup,
    armL,
    armR,
    legs: [mkLeg(-1), mkLeg(1)],
    toolSocket,
  }
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

  const body = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), bodyMat)
  body.position.y = bodyY
  body.castShadow = true
  bob.add(body)

  const belly = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.6, bh * 0.55, 0.04), bellyMat)
  belly.position.set(0, bodyY - bh * 0.08, bd / 2 + 0.01)
  bob.add(belly)

  const headGroup = new THREE.Group()
  headGroup.position.set(0, bodyY + bh * 0.5 + 0.14, def.body === 'long' ? bd * 0.34 : 0.04)
  bob.add(headGroup)

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.32), bodyMat)
  head.castShadow = true
  headGroup.add(head)

  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.1), bellyMat)
  snout.position.set(0, -0.05, 0.19)
  headGroup.add(snout)

  const eyeMat = toon(0x24201c)
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.04), eyeMat)
    eye.position.set(side * 0.09, 0.04, 0.17)
    headGroup.add(eye)
  }

  if (def.ears === 'long') {
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.06), bodyMat)
      ear.position.set(side * 0.1, 0.26, -0.02)
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
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, legY, 0.1), bodyMat)
    leg.position.y = -legY / 2
    leg.castShadow = true
    pivot.add(leg)
    bob.add(pivot)
    legs.push(pivot)
  }

  const tail = new THREE.Group()
  tail.position.set(0, bodyY + 0.04, -bd / 2)
  const tailMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.22), bodyMat)
  tailMesh.position.z = -0.11
  tail.add(tailMesh)
  bob.add(tail)

  return { root, bob, head: headGroup, legs, tail }
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
