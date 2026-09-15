import * as THREE from 'three'
import type { CropDef } from '../../types'
import { mergeSimple, paint } from '../TerrainMesh'

/**
 * Dựng geometry cho một loại cây ở một giai đoạn. Kết quả được cache theo
 * `${cropId}:${stage}` ở CropRenderer, nên hàm này chỉ chạy vài chục lần.
 */
export function buildCropGeometry(def: CropDef, stage: number): THREE.BufferGeometry {
  const t = def.stages > 1 ? stage / (def.stages - 1) : 1
  const mature = stage >= def.stages - 1

  switch (def.shape) {
    case 'stalk':
      return stalkCrop(def, t, mature)
    case 'vine':
      return vineCrop(def, t, mature)
    default:
      return leafyCrop(def, t, mature)
  }
}

/** Mầm nhỏ chung cho giai đoạn 0 của mọi loại cây. */
function sprout(color: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 2; i++) {
    const leaf = new THREE.ConeGeometry(0.07, 0.22, 4)
    leaf.rotateZ(i === 0 ? 0.5 : -0.5)
    leaf.translate(i === 0 ? 0.05 : -0.05, 0.12, 0)
    parts.push(paint(leaf, color))
  }
  return mergeSimple(parts)
}

function leafyCrop(def: CropDef, t: number, mature: boolean): THREE.BufferGeometry {
  if (t <= 0.01) return sprout(def.colorLeaf)

  const parts: THREE.BufferGeometry[] = []
  const h = 0.16 + t * 0.34
  const leaves = 3 + Math.round(t * 3)

  for (let i = 0; i < leaves; i++) {
    const angle = (i / leaves) * Math.PI * 2
    const leaf = new THREE.ConeGeometry(0.09 + t * 0.05, h, 4)
    leaf.rotateZ(0.55)
    leaf.rotateY(angle)
    leaf.translate(Math.cos(angle) * 0.12 * t, h * 0.5, Math.sin(angle) * 0.12 * t)
    parts.push(paint(leaf, i % 2 === 0 ? def.colorLeaf : darken(def.colorLeaf, 0.85)))
  }

  if (mature) {
    // Củ nhô lên khỏi mặt đất, dấu hiệu để người chơi biết là thu được rồi.
    const root = new THREE.SphereGeometry(0.17, 7, 5)
    root.scale(1, 0.85, 1)
    root.translate(0, 0.1, 0)
    parts.push(paint(root, def.colorFruit))
  }

  return mergeSimple(parts)
}

function vineCrop(def: CropDef, t: number, mature: boolean): THREE.BufferGeometry {
  if (t <= 0.01) return sprout(def.colorLeaf)

  const parts: THREE.BufferGeometry[] = []
  const h = 0.2 + t * 0.55

  const stem = new THREE.CylinderGeometry(0.035, 0.05, h, 5)
  stem.translate(0, h / 2, 0)
  parts.push(paint(stem, darken(def.colorLeaf, 0.8)))

  const leafCount = 3 + Math.round(t * 3)
  for (let i = 0; i < leafCount; i++) {
    const y = 0.12 + (i / leafCount) * h * 0.8
    const angle = i * 2.4
    const leaf = new THREE.SphereGeometry(0.1 + t * 0.06, 5, 4)
    leaf.scale(1.3, 0.35, 1)
    leaf.translate(Math.cos(angle) * 0.16, y, Math.sin(angle) * 0.16)
    parts.push(paint(leaf, i % 2 === 0 ? def.colorLeaf : darken(def.colorLeaf, 0.88)))
  }

  if (mature) {
    for (let i = 0; i < 3; i++) {
      const angle = i * 2.1 + 0.7
      const fruit = new THREE.SphereGeometry(0.11, 6, 5)
      fruit.translate(Math.cos(angle) * 0.18, 0.2 + i * 0.14, Math.sin(angle) * 0.18)
      parts.push(paint(fruit, def.colorFruit))
    }
  }

  return mergeSimple(parts)
}

function stalkCrop(def: CropDef, t: number, mature: boolean): THREE.BufferGeometry {
  if (t <= 0.01) return sprout(def.colorLeaf)

  const parts: THREE.BufferGeometry[] = []
  const h = 0.3 + t * 0.95

  const stalk = new THREE.CylinderGeometry(0.04, 0.06, h, 5)
  stalk.translate(0, h / 2, 0)
  parts.push(paint(stalk, darken(def.colorLeaf, 0.75)))

  const bladeCount = 3 + Math.round(t * 3)
  for (let i = 0; i < bladeCount; i++) {
    const y = 0.18 + (i / bladeCount) * h * 0.85
    const angle = i * 1.9
    const blade = new THREE.ConeGeometry(0.06, 0.4 + t * 0.2, 3)
    blade.rotateZ(Math.PI * 0.42)
    blade.rotateY(angle)
    blade.translate(Math.cos(angle) * 0.2, y, Math.sin(angle) * 0.2)
    parts.push(paint(blade, i % 2 === 0 ? def.colorLeaf : darken(def.colorLeaf, 0.85)))
  }

  if (mature) {
    const cob = new THREE.CylinderGeometry(0.07, 0.05, 0.3, 6)
    cob.rotateZ(0.32)
    cob.translate(0.13, h * 0.62, 0)
    parts.push(paint(cob, def.colorFruit))
  }

  return mergeSimple(parts)
}

function darken(hex: number, factor: number): number {
  const c = new THREE.Color(hex)
  c.multiplyScalar(factor)
  return c.getHex()
}
