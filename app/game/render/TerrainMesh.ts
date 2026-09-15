import * as THREE from 'three'
import type { Grid } from '../world/Grid'
import { SEABED, WATER_LEVEL } from '../world/Heightmap'
import { PALETTE, grassColorAt, soilColorAt, toonVertexColors } from './Materials'
import { makeInstancedOutline } from './Outline'
import { Y_TILLED, plotTransform } from './instanceTransforms'

/**
 * Địa hình được nướng thành MỘT mesh duy nhất với màu ở vertex: 1 draw call cho
 * cả bản đồ. Rebuild toàn bộ khi có ô thay đổi — với 80×80 ô việc này tốn vài
 * mili-giây nên không cần cập nhật từng phần cho phức tạp.
 */
export class TerrainMesh {
  readonly mesh: THREE.Mesh
  readonly plots: THREE.InstancedMesh
  readonly plotsOutline: THREE.InstancedMesh
  readonly water: THREE.Mesh
  readonly seabed: THREE.Mesh

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

    this.plots = new THREE.InstancedMesh(plotGeometry(), toonVertexColors(), tiles)
    this.plots.count = 0
    this.plots.receiveShadow = true
    this.plots.castShadow = false
    // Bounding sphere của InstancedMesh lấy từ geometry gốc ở origin, không bao
    // các instance -> để mặc định thì cả lớp luống biến mất khi rời góc bản đồ.
    this.plots.frustumCulled = false
    this.plots.name = 'plots'
    this.plotsOutline = makeInstancedOutline(this.plots, 0.03)

    this.water = this.buildWater()
    this.seabed = buildSeabed(grid)

    this.rebuild(0)
  }

  /** Dựng lại toàn bộ geometry. `now` là game-time, dùng để biết ô nào còn ẩm. */
  rebuild(now: number): void {
    const { grid, positions, normals, colors } = this
    const H = grid.heights
    let p = 0

    for (const tile of grid.tiles) {
      const { x, z } = tile
      // Ô đã cuốc KHÔNG đổi màu nền nữa: mảng đất là một đĩa bầu dục vẽ đè lên
      // cỏ (xem `plots`). Tô nâu cả ô sẽ lộ ra lưới vuông, thứ mà phong cách vẽ
      // tay không bao giờ có.
      const lift = 0

      let flat: number | null = null
      switch (tile.ground) {
        case 'water':
          flat = PALETTE.waterBed
          break
        case 'path':
          flat = soilColorAt(x, z, PALETTE.path)
          break
        case 'sand':
          flat = soilColorAt(x, z, PALETTE.sand)
          break
        case 'soil':
          flat = soilColorAt(x, z, PALETTE.soil)
          break
        default:
          flat = null
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

    this.rebuildPlots(now)
  }

  private rebuildPlots(now: number): void {
    let i = 0
    for (const tile of this.grid.tiles) {
      if (!tile.tilled) continue
      const wet = tile.wetUntil > now
      // Xoay và méo mỗi đĩa một kiểu để hàng luống không lộ ra là cùng một
      // khuôn lặp lại — đây là cái làm nó trông như vẽ tay từng mảng.
      plotTransform(this.dummy, this.grid, tile.x, tile.z)
      this.plots.setMatrixAt(i, this.dummy.matrix)
      this.color.setHex(wet ? PALETTE.soilTilledWet : PALETTE.soilTilled)
      this.plots.setColorAt(i, this.color)
      i++
    }
    this.plots.count = i
    this.plotsOutline.count = i
    this.plots.instanceMatrix.needsUpdate = true
    if (this.plots.instanceColor) this.plots.instanceColor.needsUpdate = true
  }

  /**
   * Mặt nước là MỘT mặt phẳng lớn ở đúng mực nước, trải xa quá mép lưới tới
   * tận chân trời. Không cần cắt theo ô: đất đảo nằm trên mực nước nên tự che
   * mặt phẳng này, còn lòng ao và đáy biển nằm dưới nên nước tự lộ ra ở đó.
   * Tách khỏi mesh đất vì nó cần alpha blending và gợn sóng.
   */
  private buildWater(): THREE.Mesh {
    const size = SEA_EXTENT * 2
    // Chia lưới thưa: gợn sóng chỉ cần vài đỉnh mỗi đơn vị là đủ mượt, và
    // 140² đỉnh cho cả đại dương là rẻ.
    const geo = new THREE.PlaneGeometry(size, size, 140, 140)
    geo.rotateX(-Math.PI / 2)
    geo.translate(this.grid.width / 2, 0, this.grid.height / 2)

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
    mesh.frustumCulled = false
    mesh.name = 'water'
    return mesh
  }

  update(elapsedSeconds: number): void {
    this.waterUniforms.uTime.value = elapsedSeconds
  }

  dispose(): void {
    this.geo.dispose()
    this.plots.geometry.dispose()
    this.plots.dispose()
    this.plotsOutline.dispose()
    this.water.geometry.dispose()
    ;(this.water.material as THREE.Material).dispose()
    this.seabed.geometry.dispose()
    ;(this.seabed.material as THREE.Material).dispose()
  }
}

/** Nửa cạnh của mặt biển và đáy biển, tính từ tâm bản đồ. Xa hơn tầm sương mù. */
const SEA_EXTENT = 320

/**
 * Đáy biển ngoài mép lưới: một mặt phẳng phẳng lì cùng cao độ với đáy trong
 * lưới, để nhìn xuyên qua nước thấy màu đáy liền mạch chứ không thấy vòm trời
 * lộ ra dưới chân đảo.
 */
function buildSeabed(grid: Grid): THREE.Mesh {
  const size = SEA_EXTENT * 2
  const geo = new THREE.PlaneGeometry(size, size)
  geo.rotateX(-Math.PI / 2)
  geo.translate(grid.width / 2, 0, grid.height / 2)
  const mesh = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color: PALETTE.waterBed }))
  mesh.position.y = SEABED
  mesh.frustumCulled = false
  mesh.name = 'seabed'
  return mesh
}

/**
 * Một mảng đất đã cuốc: đĩa bầu dục dẹt, mép hơi méo.
 *
 * Bán kính lớn hơn nửa ô (0.55 > 0.5) nên các mảng kề nhau chồng mép vào nhau
 * thành một vạt đất liền, thay vì xếp thành lưới ô vuông đều tăm tắp.
 */
function plotGeometry(): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(0.55, 0.5, 0.09, 16, 1)
  geo.translate(0, 0.045, 0)

  // Bóp méo nhẹ vành đĩa cho ra nét bút tay.
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const r = Math.hypot(x, z)
    if (r < 0.01) continue
    const wobble = 1 + Math.sin(Math.atan2(z, x) * 3.7) * 0.055
    pos.setXYZ(i, x * wobble, pos.getY(i), z * wobble)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()

  // Màu thật lấy từ instanceColor; ở đây chỉ cần attribute tồn tại.
  const count = geo.getAttribute('position').count
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3))
  return geo
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
