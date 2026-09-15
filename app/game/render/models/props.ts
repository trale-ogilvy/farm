import * as THREE from 'three'
import type { PropKind } from '../../types'
import { PALETTE } from '../Materials'
import { mergeSimple, paint } from '../TerrainMesh'

/**
 * Mỗi loại prop là một geometry gộp sẵn có màu ở vertex, để cả bản đồ chỉ tốn
 * một draw call cho mỗi loại (dùng qua InstancedMesh).
 */
export function buildPropGeometry(kind: PropKind): THREE.BufferGeometry {
  switch (kind) {
    case 'tree':
      return treeGeometry()
    case 'rock':
      return rockGeometry()
    case 'bush':
      return bushGeometry()
    case 'stump':
      return stumpGeometry()
  }
}

function treeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  const trunk = new THREE.CylinderGeometry(0.13, 0.19, 1.15, 6)
  trunk.translate(0, 0.575, 0)
  parts.push(paint(trunk, PALETTE.trunk))

  // Tán lá là mấy khối đa diện lệch nhau — rẻ và ra đúng chất low-poly.
  const blobs: Array<[number, number, number, number, number]> = [
    [0, 1.5, 0, 0.72, PALETTE.foliage],
    [0.34, 1.24, 0.18, 0.5, PALETTE.foliageDark],
    [-0.3, 1.32, -0.2, 0.46, PALETTE.foliageDark],
    [0.05, 2.0, -0.05, 0.44, PALETTE.foliage],
  ]
  for (const [x, y, z, r, color] of blobs) {
    const g = new THREE.IcosahedronGeometry(r, 0)
    g.scale(1, 0.86, 1)
    g.translate(x, y, z)
    parts.push(paint(g, color))
  }

  return mergeSimple(parts)
}

function rockGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const a = new THREE.IcosahedronGeometry(0.42, 0)
  a.scale(1.1, 0.76, 0.95)
  a.rotateY(0.6)
  a.translate(0, 0.3, 0)
  parts.push(paint(a, PALETTE.rock))

  const b = new THREE.IcosahedronGeometry(0.26, 0)
  b.scale(1, 0.8, 1)
  b.translate(0.3, 0.18, 0.22)
  parts.push(paint(b, PALETTE.rockDark))

  return mergeSimple(parts)
}

function bushGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const offsets: Array<[number, number, number, number]> = [
    [0, 0.3, 0, 0.36],
    [0.26, 0.24, 0.12, 0.26],
    [-0.22, 0.22, -0.14, 0.24],
  ]
  for (const [x, y, z, r] of offsets) {
    const g = new THREE.IcosahedronGeometry(r, 0)
    g.scale(1, 0.82, 1)
    g.translate(x, y, z)
    parts.push(paint(g, PALETTE.bush))
  }
  return mergeSimple(parts)
}

function stumpGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const body = new THREE.CylinderGeometry(0.24, 0.28, 0.3, 7)
  body.translate(0, 0.15, 0)
  parts.push(paint(body, PALETTE.trunk))

  const top = new THREE.CylinderGeometry(0.2, 0.2, 0.04, 7)
  top.translate(0, 0.31, 0)
  parts.push(paint(top, 0x9a7448))

  return mergeSimple(parts)
}
