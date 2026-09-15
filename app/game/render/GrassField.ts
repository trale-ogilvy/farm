import * as THREE from 'three'
import type { Grid } from '../world/Grid'
import { mulberry32, valueNoise2D } from '../core/rng'
import { mergeSimple } from './TerrainMesh'
import { PALETTE } from './Materials'

/** Trần số túm cỏ. Vượt ngưỡng này thì thưa bớt thay vì tụt khung hình. */
const MAX_TUFTS = 18000

/**
 * Thảm cỏ 3D rải trên các ô cỏ, lắc theo gió.
 *
 * Đây là thứ khác biệt lớn nhất giữa "mặt đất tô màu" và "đồng cỏ Breath of the
 * Wild". Toàn bộ nằm trong MỘT InstancedMesh (một draw call) và gió được tính
 * trong vertex shader, nên CPU không phải đụng tới nó mỗi frame.
 */
export class GrassField {
  readonly mesh: THREE.InstancedMesh

  private uniforms = { uTime: { value: 0 }, uWind: { value: 0.55 } }

  constructor(grid: Grid) {
    const geo = tuftGeometry()
    const mat = new THREE.MeshToonMaterial({ vertexColors: true })

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime
      shader.uniforms.uWind = this.uniforms.uWind
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform float uWind;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           // Vị trí gốc của instance quyết định pha, nên từng túm lắc lệch nhau
           // thành sóng chạy qua đồng cỏ chứ không đập cùng nhịp.
           vec3 base = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
           float phase = base.x * 0.35 + base.z * 0.28;
           float gust = sin(uTime * 1.3 + phase) * 0.6 + sin(uTime * 2.7 + phase * 1.7) * 0.4;
           // Chỉ ngọn cỏ lắc: gốc bám đất nên nhân theo độ cao cục bộ.
           float bend = uWind * gust * max(position.y, 0.0);
           transformed.x += bend * 0.35;
           transformed.z += bend * 0.22;`,
        )
    }

    const spots = this.pickSpots(grid)
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length))
    this.mesh.castShadow = false
    this.mesh.receiveShadow = true
    this.mesh.frustumCulled = false
    this.mesh.name = 'grass'

    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    const rand = mulberry32(0x91a55)

    spots.forEach((s, i) => {
      dummy.position.set(s.x, s.y, s.z)
      dummy.rotation.set(0, rand() * Math.PI * 2, 0)
      // Nhân vật cao ~1.25 đơn vị; túm cỏ phải nằm quanh 0.2-0.35 thì mới ra
      // đồng cỏ. Để cao hơn là nhân vật lội trong rừng gai.
      dummy.scale.setScalar(0.75 + rand() * 0.55)
      dummy.updateMatrix()
      this.mesh.setMatrixAt(i, dummy.matrix)
      // Biến thiên màu nhẹ giữa các túm để đồng cỏ không trông như in ra hàng loạt.
      // Túm cỏ hơi SẪM hơn nền: chúng là chi tiết bề mặt, không phải vật thể
      // cần nổi lên. Sáng hơn nền thì cả đồng cỏ nhấp nháy lấm tấm.
      color.setHex(PALETTE.grassDark).offsetHSL(0, (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.09)
      this.mesh.setColorAt(i, color)
    })
    this.mesh.count = spots.length
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  /** Chọn chỗ mọc cỏ: chỉ ô cỏ trống, mật độ theo nhiễu để có mảng dày mảng thưa. */
  private pickSpots(grid: Grid): Array<{ x: number; y: number; z: number }> {
    const rand = mulberry32(0x5a17)
    const density = valueNoise2D(0x2b1c)
    const spots: Array<{ x: number; y: number; z: number }> = []

    for (const tile of grid.tiles) {
      if (tile.ground !== 'grass' || tile.prop || tile.tilled) continue
      const d = density(tile.x * 0.08, tile.z * 0.08)
      const count = d > 0.62 ? 3 : d > 0.38 ? 2 : 1
      for (let k = 0; k < count; k++) {
        if (spots.length >= MAX_TUFTS) return spots
        const x = tile.x + (rand() - 0.5) * 0.95
        const z = tile.z + (rand() - 0.5) * 0.95
        spots.push({ x, y: grid.groundY(x, z), z })
      }
    }
    return spots
  }

  update(elapsedSeconds: number): void {
    this.uniforms.uTime.value = elapsedSeconds
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.mesh.dispose()
  }
}

/** Một túm gồm ba lá cỏ toè ra, gốc sẫm ngọn nhạt. */
function tuftGeometry(): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = []
  const tip = new THREE.Color(0xffffff)
  const root = new THREE.Color(0x9a9a9a)

  for (let i = 0; i < 3; i++) {
    const h = 0.17 + i * 0.05
    const blade = new THREE.ConeGeometry(0.06, h, 4, 1)
    blade.translate(0, h / 2, 0)
    blade.rotateZ((i - 1) * 0.26)
    blade.rotateY((i / 3) * Math.PI * 2)
    blade.translate((i - 1) * 0.07, 0, (i % 2) * 0.06)

    // Màu nướng theo chiều cao: nhân với instanceColor lúc vẽ ra sắc cuối cùng.
    const pos = blade.getAttribute('position')
    const col = new Float32Array(pos.count * 3)
    for (let v = 0; v < pos.count; v++) {
      const t = Math.min(1, Math.max(0, pos.getY(v) / h))
      const c = root.clone().lerp(tip, t)
      col[v * 3] = c.r
      col[v * 3 + 1] = c.g
      col[v * 3 + 2] = c.b
    }
    blade.setAttribute('color', new THREE.BufferAttribute(col, 3))
    blades.push(blade)
  }

  return mergeSimple(blades)
}
