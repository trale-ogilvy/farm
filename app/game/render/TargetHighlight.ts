import * as THREE from 'three'

/** Vàng ấm. Nổi trên cả nền cỏ xanh lẫn đất nâu mà không phá bảng màu pastel. */
export const GLOW = 0xffcf6b
/**
 * Đỏ tươi: đúng mục tiêu nhưng ngoài tầm với — phải lại gần. Đỏ hẳn chứ không
 * đỏ gạch: pha 45% với nền cỏ, đỏ gạch ra màu nâu y hệt mảng đất đã cuốc.
 */
export const GLOW_FAR = 0xf03a2a

export type HighlightTone = 'ok' | 'far'

/**
 * Lớp màng sáng phủ lên vật thể đang được nhắm.
 *
 * Phủ lên CHÍNH hình dạng của vật thể chứ không vẽ một khung quanh ô: người chơi
 * thấy rõ "cây này", "mảng đất này", chứ không phải "ô lưới ở đâu đó dưới chân
 * nó". Với ô cỏ chưa cuốc — nơi chưa có vật thể nào — cùng lớp màng này đóng vai
 * bản xem trước của mảng đất sắp tạo ra.
 *
 * Dùng polygonOffset thay vì phình theo pháp tuyến: hai bề mặt trùng khít nhau
 * nên chỉ cần kéo lớp màng về phía camera một chút là hết z-fighting, và hình
 * dạng vẫn khớp tuyệt đối với vật thể bên dưới.
 */
export class TargetHighlight {
  readonly mesh: THREE.Mesh
  private mat: THREE.MeshBasicMaterial
  private empty = new THREE.BufferGeometry()
  private tone: HighlightTone = 'ok'

  constructor() {
    this.mat = new THREE.MeshBasicMaterial({
      color: GLOW,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    })

    this.mesh = new THREE.Mesh(this.empty, this.mat)
    this.mesh.visible = false
    this.mesh.matrixAutoUpdate = false
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 5
    this.mesh.name = 'highlight'
  }

  show(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, tone: HighlightTone): void {
    if (this.mesh.geometry !== geometry) this.mesh.geometry = geometry
    this.mat.color.setHex(tone === 'far' ? GLOW_FAR : GLOW)
    this.tone = tone
    this.mesh.matrix.copy(matrix)
    this.mesh.matrixWorldNeedsUpdate = true
    this.mesh.visible = true
  }

  hide(): void {
    this.mesh.visible = false
  }

  /** Nhấp nháy chậm để mắt bắt được mà không gây khó chịu khi nhìn lâu. */
  update(elapsedSeconds: number): void {
    if (!this.mesh.visible) return
    // Đỏ đậm hơn vàng một chút: nó là lời từ chối, phải đọc ra ngay.
    const base = this.tone === 'far' ? 0.55 : 0.42
    this.mat.opacity = base + Math.sin(elapsedSeconds * 4.2) * 0.15
  }

  dispose(): void {
    this.mat.dispose()
    this.empty.dispose()
  }
}
