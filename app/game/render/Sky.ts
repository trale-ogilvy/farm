import * as THREE from 'three'

/**
 * Vòm trời gradient. Thay cho `scene.background` một màu phẳng, vì cảm giác
 * không gian mở của Breath of the Wild đến phần lớn từ việc chân trời sáng hơn
 * đỉnh trời — mắt đọc ra chiều sâu ngay cả khi địa hình rất đơn giản.
 */
export class Sky {
  readonly mesh: THREE.Mesh

  private uniforms = {
    uZenith: { value: new THREE.Color(0x3f7fd0) },
    uHorizon: { value: new THREE.Color(0xbfe4f5) },
    uGround: { value: new THREE.Color(0x8aa06a) },
  }

  constructor() {
    const geo = new THREE.SphereGeometry(260, 24, 16)
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vWorld = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uGround;
        varying vec3 vWorld;
        void main() {
          float h = normalize(vWorld).y;
          // Dải chân trời hẹp và mượt; dưới chân trời chuyển dần sang màu đất
          // để khi camera hạ thấp không lộ ra mép vòm.
          vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, h));
          vec3 col = mix(uGround, sky, smoothstep(-0.12, 0.02, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })

    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.renderOrder = -1
    this.mesh.frustumCulled = false
    this.mesh.name = 'sky'
  }

  /**
   * Đổi màu theo giờ trong ngày. `daylight` 0..1.
   * Trả về màu chân trời để fog dùng chung — fog cùng màu chân trời là mẹo làm
   * cho vật ở xa tan vào nền thay vì bị cắt cụt.
   */
  update(daylight: number, camera: THREE.Camera): THREE.Color {
    const dusk = Math.pow(1 - daylight, 1.6)

    this.uniforms.uZenith.value.setHSL(0.6, 0.45 + daylight * 0.2, 0.16 + daylight * 0.34)
    this.uniforms.uHorizon.value.setHSL(
      0.56 - dusk * 0.5, // hoàng hôn kéo chân trời về phía cam
      0.3 + dusk * 0.35,
      0.22 + daylight * 0.56,
    )
    this.uniforms.uGround.value.setHSL(0.25, 0.22, 0.12 + daylight * 0.22)

    this.mesh.position.copy(camera.position)
    return this.uniforms.uHorizon.value
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
