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
    case 'house':
      return houseGeometry()
  }
}

/**
 * Nhà chính: khối tường 3×3 ô, mái dốc hai bên, cửa và ống khói. Gốc toạ độ ở
 * tâm nền nhà, để đặt thẳng vào `grid.home`.
 */
function houseGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const W = 2.7
  const D = 2.5
  const H = 1.7

  const walls = new THREE.BoxGeometry(W, H, D)
  walls.translate(0, H / 2, 0)
  parts.push(paint(walls, PALETTE.wall))

  // Mái: lăng trụ tam giác đùn từ mặt cắt, hơi rộng hơn tường để có mép chìa.
  // Nóc chạy dọc trục Z nên nhìn từ cửa (phía +Z) thấy đầu hồi tam giác.
  const ridge = 0.95
  const gable = new THREE.Shape()
  gable.moveTo(-W / 2 - 0.3, 0)
  gable.lineTo(W / 2 + 0.3, 0)
  gable.lineTo(0, ridge)
  gable.closePath()
  const roof = new THREE.ExtrudeGeometry(gable, { depth: D + 0.5, bevelEnabled: false })
  roof.translate(0, H - 0.05, -(D + 0.5) / 2)
  parts.push(paint(roof, PALETTE.roof))

  const door = new THREE.BoxGeometry(0.55, 0.95, 0.08)
  door.translate(0, 0.475, D / 2 + 0.02)
  parts.push(paint(door, PALETTE.trunk))

  const win = new THREE.BoxGeometry(0.42, 0.42, 0.08)
  win.translate(-0.85, 1.05, D / 2 + 0.02)
  parts.push(paint(win, PALETTE.water))

  const chimney = new THREE.BoxGeometry(0.3, 0.7, 0.3)
  chimney.translate(0.8, H + 0.55, -0.4)
  parts.push(paint(chimney, PALETTE.rockDark))

  return mergeSimple(parts)
}

/**
 * Bãi công trình: bốn cọc gỗ ở góc ô nối bằng dây, giữa là mảng đất đánh dấu.
 * Đọc ra ngay là "chỗ này sắp có gì đó", và khác hẳn luống đã xong.
 */
export function buildSiteGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  const mark = new THREE.CylinderGeometry(0.44, 0.44, 0.03, 12)
  mark.translate(0, 0.015, 0)
  parts.push(paint(mark, PALETTE.sand))

  const c = 0.42
  for (const [x, z] of [
    [-c, -c],
    [c, -c],
    [-c, c],
    [c, c],
  ] as const) {
    const peg = new THREE.CylinderGeometry(0.035, 0.045, 0.34, 5)
    peg.translate(x, 0.17, z)
    parts.push(paint(peg, PALETTE.trunk))
  }

  // Dây căng giữa các cọc: bốn thanh mảnh ở lưng chừng cọc.
  for (const [x, z, rot] of [
    [0, -c, 0],
    [0, c, 0],
    [-c, 0, Math.PI / 2],
    [c, 0, Math.PI / 2],
  ] as const) {
    const rope = new THREE.BoxGeometry(c * 2, 0.025, 0.025)
    rope.rotateY(rot)
    rope.translate(x, 0.26, z)
    parts.push(paint(rope, PALETTE.path))
  }

  return mergeSimple(parts)
}

function treeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []

  const trunk = new THREE.CylinderGeometry(0.14, 0.21, 1.15, 8)
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
    // detail 1 thay vì 0: tán lá tròn trịa thay vì là mấy viên xúc xắc.
    const g = new THREE.IcosahedronGeometry(r, 1)
    g.scale(1, 0.88, 1)
    g.translate(x, y, z)
    parts.push(paint(g, color))
  }

  return mergeSimple(parts)
}

/** Đá cố tình GIỮ detail 0: mặt cắt sắc cạnh mới đọc ra là đá, bo tròn thành cục bột. */
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
    const g = new THREE.IcosahedronGeometry(r, 1)
    g.scale(1, 0.84, 1)
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
