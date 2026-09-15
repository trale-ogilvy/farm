import * as THREE from 'three'
import type { Grid } from '../world/Grid'
import { WATER_LEVEL } from '../world/Heightmap'
import { PALETTE, grassColorAt, soilColorAt, toonVertexColors } from './Materials'

const Y_TILLED = 0.05

/**
 * Địa hình được nướng thành MỘT mesh duy nhất với màu ở vertex: 1 draw call cho
 * cả bản đồ. Rebuild toàn bộ khi có ô thay đổi — với 72×72 ô việc này tốn vài
 * mili-giây nên không cần cập nhật từng phần cho phức tạp.
 */
export class TerrainMesh {
  readonly mesh: THREE.Mesh
  readonly furrows: THREE.InstancedMesh
  readonly water: THREE.Mesh

  private geo: THREE.BufferGeometry
  private positions: Float32Array
  private normals: Float32Array
  private colors: Float32Array
  private dummy = new THREE.Object3D()
  private color = new THREE.Color()
  private waterUniforms = { uTime: { value: 0 } }

  constructor(private grid: Grid) {
    const tiles = grid.width * grid.height
    const verts = tiles * 6 // 2 tam giác, không index để mỗi ô giữ được màu riêng

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
    this.furrows.name = 'furrows'

    this.water = this.buildWater()

    this.rebuild(0)
  }

  /** Dựng lại toàn bộ geometry. `now` là game-time, dùng để biết ô nào còn ẩm. */
  rebuild(now: number): void {
    const { grid, positions, normals, colors } = this
    const H = grid.heights
    let p = 0

    for (const tile of grid.tiles) {
      const { x, z } = tile
      const wet = tile.wetUntil > now
      const lift = tile.tilled ? Y_TILLED : 0

      // Ô cỏ tô màu theo TỪNG GÓC nên đồi chuyển màu liền mạch; ô canh tác tô
      // một màu phẳng cho cả 4 góc để luống đất hiện rõ thành ô vuông.
      let flat: number | null = null
      switch (tile.ground) {
        case 'water':
          flat = PALETTE.waterBed
          break
        case 'path':
          flat = soilColorAt(x, z, PALETTE.path)
          break
        case 'soil':
          flat = soilColorAt(
            x,
            z,
            tile.tilled
              ? wet
                ? PALETTE.soilTilledWet
                : PALETTE.soilTilled
              : wet
                ? PALETTE.soilWet
                : PALETTE.soil,
          )
          break
        default:
          flat = tile.tilled
            ? soilColorAt(x, z, wet ? PALETTE.soilTilledWet : PALETTE.soilTilled)
            : null
      }

      // Thứ tự đỉnh phải cho tích có hướng ra +Y, nếu không mặt đất sẽ quay
      // lưng lên trời và bị backface culling nuốt mất.
      const quad: Array<[number, number]> = [
        [x, z],
        [x, z + 1],
        [x + 1, z + 1],
        [x, z],
        [x + 1, z + 1],
        [x + 1, z],
      ]

      for (const [ci, cj] of quad) {
        const wx = ci - 0.5
        const wz = cj - 0.5
        positions[p] = wx
        positions[p + 1] = H.corner(ci, cj) + lift
        positions[p + 2] = wz

        // Pháp tuyến suy từ độ dốc quanh góc -> đồi được tô sáng mượt thay vì
        // vỡ thành các mặt phẳng rời rạc.
        const dx = (H.corner(ci + 1, cj) - H.corner(ci - 1, cj)) * 0.5
        const dz = (H.corner(ci, cj + 1) - H.corner(ci, cj - 1)) * 0.5
        const len = Math.hypot(dx, 1, dz)
        normals[p] = -dx / len
        normals[p + 1] = 1 / len
        normals[p + 2] = -dz / len

        this.color.setHex(flat ?? grassColorAt(wx, wz))
        colors[p] = this.color.r
        colors[p + 1] = this.color.g
        colors[p + 2] = this.color.b
        p += 3
      }
    }

    this.geo.getAttribute('position').needsUpdate = true
    this.geo.getAttribute('normal').needsUpdate = true
    this.geo.getAttribute('color').needsUpdate = true
    this.geo.computeBoundingSphere()
    this.geo.computeBoundingBox()

    this.rebuildFurrows(now)
  }

  private rebuildFurrows(now: number): void {
    let i = 0
    for (const tile of this.grid.tiles) {
      if (!tile.tilled) continue
      const wet = tile.wetUntil > now
      this.dummy.position.set(
        tile.x,
        this.grid.heights.tileHeight(tile.x, tile.z) + Y_TILLED,
        tile.z,
      )
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

  /**
   * Mặt nước là một mesh riêng, trong suốt, phủ đúng các ô ngập. Tách ra khỏi
   * địa hình vì nó cần alpha blending và gợn sóng — hai thứ mà mesh đất không
   * nên gánh.
   */
  private buildWater(): THREE.Mesh {
    const verts: number[] = []
    for (const tile of this.grid.tiles) {
      if (tile.ground !== 'water') continue
      const x0 = tile.x - 0.5
      const x1 = tile.x + 0.5
      const z0 = tile.z - 0.5
      const z1 = tile.z + 0.5
      verts.push(x0, 0, z0, x0, 0, z1, x1, 0, z1, x0, 0, z0, x1, 0, z1, x1, 0, z0)
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    geo.computeVertexNormals()

    const mat = new THREE.MeshToonMaterial({
      color: PALETTE.water,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    })

    // Gợn sóng bằng cách đẩy đỉnh trong vertex shader: rẻ hơn nhiều so với cập
    // nhật mảng position từ JS mỗi frame.
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.waterUniforms.uTime
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           transformed.y += sin(position.x * 1.7 + uTime * 1.6) * 0.045
                          + sin(position.z * 2.3 - uTime * 1.1) * 0.035;`,
        )
    }

    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.y = WATER_LEVEL
    mesh.renderOrder = 2
    mesh.name = 'water'
    return mesh
  }

  update(elapsedSeconds: number): void {
    this.waterUniforms.uTime.value = elapsedSeconds
  }

  dispose(): void {
    this.geo.dispose()
    this.furrows.geometry.dispose()
    this.furrows.dispose()
    this.water.geometry.dispose()
    ;(this.water.material as THREE.Material).dispose()
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
