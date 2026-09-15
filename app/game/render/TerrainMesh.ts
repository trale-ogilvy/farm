import * as THREE from 'three'
import type { Grid } from '../world/Grid'
import { PALETTE, grassColorAt, soilColorAt, toonVertexColors } from './Materials'

const Y_WATER = -0.16
const Y_BASE = 0
const Y_TILLED = 0.04

/**
 * Địa hình được nướng thành MỘT mesh duy nhất với màu ở vertex: 1 draw call cho
 * cả bản đồ. Rebuild toàn bộ khi có ô thay đổi — với 48×48 ô việc này tốn dưới
 * 1ms nên không cần cập nhật từng phần cho phức tạp.
 */
export class TerrainMesh {
  readonly mesh: THREE.Mesh
  readonly furrows: THREE.InstancedMesh

  private geo: THREE.BufferGeometry
  private positions: Float32Array
  private normals: Float32Array
  private colors: Float32Array
  private dummy = new THREE.Object3D()
  private color = new THREE.Color()

  constructor(private grid: Grid) {
    const tiles = grid.width * grid.height
    const verts = tiles * 6 // 2 tam giác, không dùng index để mỗi ô có màu phẳng riêng

    this.positions = new Float32Array(verts * 3)
    this.normals = new Float32Array(verts * 3)
    this.colors = new Float32Array(verts * 3)

    this.geo = new THREE.BufferGeometry()
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3))
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3))

    this.mesh = new THREE.Mesh(this.geo, toonVertexColors())
    this.mesh.receiveShadow = true
    this.mesh.name = 'terrain'

    this.furrows = new THREE.InstancedMesh(furrowGeometry(), toonVertexColors(), tiles)
    this.furrows.count = 0
    this.furrows.receiveShadow = true
    this.furrows.castShadow = true
    // Bounding sphere của InstancedMesh lấy từ geometry gốc ở origin, không bao
    // các instance -> để mặc định thì cả lớp luống biến mất khi rời góc bản đồ.
    this.furrows.frustumCulled = false
    this.furrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.furrows.name = 'furrows'

    this.rebuild(0)
  }

  /** Dựng lại toàn bộ geometry. `now` là game-time, dùng để biết ô nào còn ẩm. */
  rebuild(now: number): void {
    const { grid, positions, normals, colors } = this
    let p = 0

    for (const tile of grid.tiles) {
      const { x, z } = tile
      const wet = tile.wetUntil > now
      let y = Y_BASE
      let hex: number

      switch (tile.ground) {
        case 'water':
          y = Y_WATER
          hex = (x + z) % 3 === 0 ? PALETTE.waterDeep : PALETTE.water
          break
        case 'path':
          hex = soilColorAt(x, z, PALETTE.path)
          break
        case 'soil':
          if (tile.tilled) {
            y = Y_TILLED
            hex = soilColorAt(x, z, wet ? PALETTE.soilTilledWet : PALETTE.soilTilled)
          } else {
            hex = soilColorAt(x, z, wet ? PALETTE.soilWet : PALETTE.soil)
          }
          break
        default:
          if (tile.tilled) {
            y = Y_TILLED
            hex = soilColorAt(x, z, wet ? PALETTE.soilTilledWet : PALETTE.soilTilled)
          } else {
            hex = grassColorAt(x, z)
          }
      }

      this.color.setHex(hex)
      const { r, g, b } = this.color

      // Ô nằm trên mặt phẳng XZ, tâm ô trùng toạ độ nguyên (x, z).
      const x0 = x - 0.5
      const x1 = x + 0.5
      const z0 = z - 0.5
      const z1 = z + 0.5

      // Thứ tự đỉnh phải cho tích có hướng ra +Y, nếu không mặt đất sẽ quay
      // lưng lên trời và bị backface culling nuốt mất.
      const quad = [
        x0, y, z0, x1, y, z1, x1, y, z0,
        x0, y, z0, x0, y, z1, x1, y, z1,
      ]

      for (let v = 0; v < 6; v++) {
        positions[p] = quad[v * 3]!
        positions[p + 1] = quad[v * 3 + 1]!
        positions[p + 2] = quad[v * 3 + 2]!
        normals[p] = 0
        normals[p + 1] = 1
        normals[p + 2] = 0
        colors[p] = r
        colors[p + 1] = g
        colors[p + 2] = b
        p += 3
      }
    }

    this.geo.getAttribute('position').needsUpdate = true
    this.geo.getAttribute('normal').needsUpdate = true
    this.geo.getAttribute('color').needsUpdate = true
    this.geo.computeBoundingSphere()

    this.rebuildFurrows(now)
  }

  private rebuildFurrows(now: number): void {
    let i = 0
    for (const tile of this.grid.tiles) {
      if (!tile.tilled) continue
      const wet = tile.wetUntil > now
      this.dummy.position.set(tile.x, Y_TILLED, tile.z)
      this.dummy.rotation.y = ((tile.x * 31 + tile.z * 17) % 2) * Math.PI * 0.5
      this.dummy.updateMatrix()
      this.furrows.setMatrixAt(i, this.dummy.matrix)
      this.color.setHex(wet ? PALETTE.furrowRidgeWet : PALETTE.furrowRidge)
      this.furrows.setColorAt(i, this.color)
      i++
    }
    this.furrows.count = i
    this.furrows.instanceMatrix.needsUpdate = true
    if (this.furrows.instanceColor) this.furrows.instanceColor.needsUpdate = true
  }

  dispose(): void {
    this.geo.dispose()
    this.furrows.geometry.dispose()
    this.furrows.dispose()
  }
}

/** Ba rãnh cày nhỏ nổi lên trên mặt ô, gộp sẵn thành một geometry. */
function furrowGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 3; i++) {
    const g = new THREE.BoxGeometry(0.88, 0.1, 0.18)
    g.translate(0, 0.05, (i - 1) * 0.28)
    parts.push(g)
  }
  const merged = mergeSimple(parts)
  // Màu thật lấy từ instanceColor; ở đây chỉ cần attribute tồn tại.
  const count = merged.getAttribute('position').count
  merged.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3))
  return merged
}

/**
 * Gộp các BufferGeometry cùng bộ attribute. Tự viết thay vì kéo cả
 * BufferGeometryUtils vào bundle cho một hàm.
 */
export function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g))
  const attrNames = ['position', 'normal']
  const hasColor = nonIndexed.every((g) => g.getAttribute('color'))
  if (hasColor) attrNames.push('color')

  const total = nonIndexed.reduce((sum, g) => sum + g.getAttribute('position').count, 0)
  const out = new THREE.BufferGeometry()

  for (const name of attrNames) {
    const arr = new Float32Array(total * 3)
    let offset = 0
    for (const g of nonIndexed) {
      const attr = g.getAttribute(name)
      arr.set(attr.array as Float32Array, offset)
      offset += attr.count * 3
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3))
  }

  for (const g of nonIndexed) if (!geos.includes(g)) g.dispose()
  out.computeBoundingSphere()
  return out
}

/** Nướng một màu cố định vào attribute `color` của geometry. */
export function paint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex)
  const count = geo.getAttribute('position').count
  const arr = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return geo
}
