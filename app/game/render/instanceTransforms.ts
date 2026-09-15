import type * as THREE from 'three'
import type { Grid } from '../world/Grid'

/** Độ nhô của mảng đất đã cuốc so với mặt cỏ. */
export const Y_TILLED = 0.05

/**
 * Công thức đặt vị trí cho từng loại instance, gom về một chỗ.
 *
 * Highlight phải nằm CHÍNH XÁC chồng lên vật thể nó đánh dấu. Nếu mỗi nơi tự
 * chép lại công thức xoay/phóng theo hash toạ độ, chỉ cần một bên đổi hằng số
 * là highlight lệch khỏi vật thể — kiểu lỗi rất khó nhìn ra vì trông "gần đúng".
 */

/** Hash ổn định theo toạ độ ô, dùng làm nguồn ngẫu nhiên cố định. */
function hash(x: number, z: number, a: number, b: number): number {
  return ((x * a) ^ (z * b)) >>> 0
}

/** Mảng đất đã cuốc: xoay tự do và méo nhẹ hai chiều. */
export function plotTransform(o: THREE.Object3D, grid: Grid, x: number, z: number): THREE.Object3D {
  const h = hash(x, z, 48271, 69621)
  o.position.set(x, grid.heights.tileHeight(x, z) + Y_TILLED, z)
  o.rotation.set(0, (h % 628) / 100, 0)
  o.scale.set(1 + ((h >> 8) % 14) / 100, 1, 1 + ((h >> 16) % 14) / 100)
  o.updateMatrix()
  return o
}

/** Cây cối, đá, bụi: xoay quanh trục đứng và phóng to nhẹ. */
export function propTransform(o: THREE.Object3D, grid: Grid, x: number, z: number): THREE.Object3D {
  const h = hash(x, z, 73856093, 19349663)
  o.position.set(x, grid.heights.tileHeight(x, z), z)
  o.rotation.set(0, (h % 360) * 0.0174, 0)
  o.scale.setScalar(0.86 + ((h >> 8) % 100) / 340)
  o.updateMatrix()
  return o
}

/** Cây trồng: nhô lên khỏi mảng đất một chút, biến thiên nhỏ hơn prop. */
export function cropTransform(o: THREE.Object3D, grid: Grid, x: number, z: number): THREE.Object3D {
  const h = hash(x, z, 12289, 32771)
  o.position.set(x, grid.heights.tileHeight(x, z) + 0.06, z)
  o.rotation.set(0, (h % 360) * 0.0174, 0)
  o.scale.setScalar(0.92 + ((h >> 8) % 100) / 620)
  o.updateMatrix()
  return o
}
