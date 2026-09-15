import * as THREE from 'three'
import type { Grid } from '../world/Grid'

/** Góc ngẩng nhỏ nhất/lớn nhất, radian. Chặn camera chui xuống đất hoặc lật đỉnh. */
const PITCH_MIN = THREE.MathUtils.degToRad(16)
const PITCH_MAX = THREE.MathUtils.degToRad(72)

export const DIST_MIN = 6
export const DIST_MAX = 24

/** Camera luôn nhìn vào điểm cao hơn chân nhân vật chừng này. */
const FOCUS_HEIGHT = 1.15

/**
 * Camera quỹ đạo kiểu Breath of the Wild: bám sau lưng nhân vật, xoay và zoom
 * tự do, và không bao giờ chui xuống dưới mặt đất.
 *
 * Toàn bộ điều khiển di chuyển phụ thuộc vào `yaw` ở đây — bấm W nghĩa là "đi
 * về phía camera đang nhìn", không phải "đi về -Z". Vì vậy rig này là nguồn sự
 * thật cho hướng, và Player đọc `forward()`/`right()` từ nó.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera

  /** Góc quay quanh trục đứng, radian. 0 = camera đứng ở phía +Z nhìn về -Z. */
  yaw = 0
  // Ngẩng vừa phải: đủ thấy lưới ô để canh cuốc đất, nhưng vẫn để lọt chân
  // trời vào khung hình — thiếu chân trời là mất hẳn cảm giác thế giới mở.
  pitch = THREE.MathUtils.degToRad(21)
  distance = 14

  private focus = new THREE.Vector3()
  private desired = new THREE.Vector3()

  constructor(private grid: Grid) {
    this.camera = new THREE.PerspectiveCamera(54, 1, 0.3, 500)
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  /** Xoay theo quãng kéo chuột tính bằng pixel. */
  rotate(dxPixels: number, dyPixels: number): void {
    this.yaw -= dxPixels * 0.005
    this.pitch = THREE.MathUtils.clamp(this.pitch + dyPixels * 0.004, PITCH_MIN, PITCH_MAX)
  }

  zoom(delta: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance + delta, DIST_MIN, DIST_MAX)
  }

  /** Hướng "tiến" chiếu xuống mặt phẳng XZ, đã chuẩn hoá. */
  forward(): { x: number; z: number } {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }
  }

  /** Hướng "sang phải" chiếu xuống mặt phẳng XZ, đã chuẩn hoá. */
  right(): { x: number; z: number } {
    return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }
  }

  update(x: number, y: number, z: number, dt: number, instant = false): void {
    this.desired.set(x, y + FOCUS_HEIGHT, z)
    if (instant) this.focus.copy(this.desired)
    // Trễ theo hàm mũ nên tốc độ bám không phụ thuộc khung hình.
    else this.focus.lerp(this.desired, 1 - Math.pow(0.0009, dt / 1000))

    const cp = Math.cos(this.pitch)
    const camX = this.focus.x + Math.sin(this.yaw) * cp * this.distance
    const camZ = this.focus.z + Math.cos(this.yaw) * cp * this.distance
    const camY = this.focus.y + Math.sin(this.pitch) * this.distance

    // Không cho camera lún vào sườn đồi: nâng lên trên mặt đất tại chỗ nó đứng.
    const floor = this.grid.groundY(camX, camZ) + 1.4
    this.camera.position.set(camX, Math.max(camY, floor), camZ)
    this.camera.lookAt(this.focus)
  }

  /** Điểm camera đang nhìn vào — dùng để căn shadow camera và mặt trời. */
  get focusPoint(): THREE.Vector3 {
    return this.focus
  }
}
