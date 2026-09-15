import * as THREE from 'three'
import type { Grid } from '../world/Grid'
import type { PropKind } from '../types'
import { cropDef } from '../data/crops'
import { TerrainMesh } from './TerrainMesh'
import { buildPropGeometry } from './models/props'
import { buildCropGeometry } from './models/crops'
import { toonVertexColors } from './Materials'

const PROP_KINDS: PropKind[] = ['tree', 'rock', 'bush', 'stump']

/** Góc ngẩng của camera. Cố định — đây là thứ tạo ra cảm giác "2.5D diorama". */
const PITCH = THREE.MathUtils.degToRad(52)
const CAM_DISTANCE = 26

export const ZOOM_MIN = 6
export const ZOOM_MAX = 16

interface InstancedGroup {
  mesh: THREE.InstancedMesh
  capacity: number
}

/**
 * Sở hữu toàn bộ tầng three.js. Không chứa luật chơi — nó chỉ đọc `Grid` và
 * danh sách entity rồi vẽ ra. Nhờ vậy có thể thay renderer mà không đụng gameplay.
 */
export class SceneManager {
  readonly scene = new THREE.Scene()
  readonly camera: THREE.OrthographicCamera
  readonly renderer: THREE.WebGLRenderer
  readonly entityLayer = new THREE.Group()

  /** Nửa chiều cao khung nhìn tính bằng đơn vị thế giới; nhỏ hơn = zoom gần hơn. */
  viewSize = 9.5

  private terrain: TerrainMesh
  private props = new Map<string, InstancedGroup>()
  private crops = new Map<string, InstancedGroup>()
  private cursor: THREE.LineSegments
  private sun: THREE.DirectionalLight
  private hemi: THREE.HemisphereLight
  private ambient: THREE.AmbientLight
  private dummy = new THREE.Object3D()
  private raycaster = new THREE.Raycaster()
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private camTarget = new THREE.Vector3()
  private resizeObserver: ResizeObserver

  constructor(
    private canvas: HTMLCanvasElement,
    private grid: Grid,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200)
    this.scene.background = new THREE.Color(0x8fd3f4)
    this.scene.fog = new THREE.Fog(0x8fd3f4, 44, 96)

    this.ambient = new THREE.AmbientLight(0xffffff, 0.55)
    this.scene.add(this.ambient)

    this.hemi = new THREE.HemisphereLight(0xbfe6ff, 0x4a6b3a, 0.7)
    this.scene.add(this.hemi)

    this.sun = new THREE.DirectionalLight(0xfff2d0, 1.5)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 80
    this.sun.shadow.bias = -0.0012
    this.sun.shadow.normalBias = 0.03
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    this.terrain = new TerrainMesh(grid)
    this.scene.add(this.terrain.mesh, this.terrain.furrows)
    this.scene.add(this.entityLayer)

    this.cursor = makeTileCursor()
    this.cursor.visible = false
    this.scene.add(this.cursor)

    this.rebuildProps()

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas.parentElement ?? canvas)
    this.resize()
  }

  resize(): void {
    const parent = this.canvas.parentElement
    const w = parent?.clientWidth || window.innerWidth
    const h = parent?.clientHeight || window.innerHeight
    this.renderer.setSize(w, h, false)
    this.updateFrustum(w / h)
  }

  private updateFrustum(aspect: number): void {
    const halfH = this.viewSize
    const halfW = halfH * aspect
    this.camera.left = -halfW
    this.camera.right = halfW
    this.camera.top = halfH
    this.camera.bottom = -halfH
    this.camera.updateProjectionMatrix()
  }

  zoomBy(delta: number): void {
    this.viewSize = THREE.MathUtils.clamp(this.viewSize + delta, ZOOM_MIN, ZOOM_MAX)
    this.resize()
  }

  /** Camera bám theo người chơi với độ trễ nhẹ cho đỡ giật. */
  followTarget(x: number, z: number, dt: number): void {
    this.camTarget.lerp(new THREE.Vector3(x, 0, z), 1 - Math.pow(0.0015, dt / 1000))

    const oy = Math.sin(PITCH) * CAM_DISTANCE
    const oz = Math.cos(PITCH) * CAM_DISTANCE
    this.camera.position.set(this.camTarget.x, oy, this.camTarget.z + oz)
    this.camera.lookAt(this.camTarget)

    // Shadow camera bám theo tầm nhìn, không phủ cả bản đồ — giữ độ nét bóng.
    const r = this.viewSize * 1.9
    const sc = this.sun.shadow.camera
    sc.left = -r
    sc.right = r
    sc.top = r
    sc.bottom = -r
    sc.updateProjectionMatrix()
    this.sun.target.position.copy(this.camTarget)
    this.sun.target.updateMatrixWorld()
  }

  snapCameraTo(x: number, z: number): void {
    this.camTarget.set(x, 0, z)
    this.followTarget(x, z, 1e9)
  }

  /**
   * Cập nhật ánh sáng theo giờ trong game. `daylight` 0..1, `hour` 0..24.
   */
  updateLighting(daylight: number, hour: number): void {
    const angle = ((hour - 6) / 24) * Math.PI * 2
    this.sun.position.set(
      this.camTarget.x + Math.cos(angle) * 30,
      Math.max(6, Math.sin(angle) * 34),
      this.camTarget.z + 14,
    )

    const dusk = Math.pow(1 - daylight, 2)
    this.sun.intensity = 0.25 + daylight * 1.25
    this.sun.color.setHSL(0.1 - dusk * 0.05, 0.35 + dusk * 0.4, 0.72)

    // Nền đêm cố ý không tối hẳn: vẫn phải nhìn rõ luống đất để chơi tiếp được.
    this.ambient.intensity = 0.5 + daylight * 0.28
    this.hemi.intensity = 0.45 + daylight * 0.45

    const sky = new THREE.Color().setHSL(
      0.58 - dusk * 0.05,
      0.3 + daylight * 0.35,
      0.24 + daylight * 0.46,
    )
    ;(this.scene.background as THREE.Color).copy(sky)
    this.scene.fog!.color.copy(sky)
  }

  /** Ô dưới con trỏ chuột, hoặc null nếu tia không chạm mặt đất. */
  pickTile(ndcX: number, ndcY: number): { x: number; z: number } | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera)
    const hit = new THREE.Vector3()
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, hit)) return null
    const x = Math.round(hit.x)
    const z = Math.round(hit.z)
    return this.grid.inBounds(x, z) ? { x, z } : null
  }

  setCursor(tile: { x: number; z: number } | null, valid: boolean): void {
    if (!tile) {
      this.cursor.visible = false
      return
    }
    this.cursor.visible = true
    this.cursor.position.set(tile.x, 0.09, tile.z)
    ;(this.cursor.material as THREE.LineBasicMaterial).color.setHex(
      valid ? 0xffffff : 0xff6b5e,
    )
  }

  /** Gọi lại khi địa hình hoặc prop thay đổi. */
  refreshWorld(now: number): void {
    this.terrain.rebuild(now)
    this.rebuildProps()
    this.rebuildCrops()
    this.grid.dirty.clear()
  }

  private ensureGroup(
    map: Map<string, InstancedGroup>,
    key: string,
    geoFactory: () => THREE.BufferGeometry,
    needed: number,
  ): InstancedGroup {
    let group = map.get(key)
    if (group && group.capacity >= needed) return group

    // InstancedMesh không nở ra được, nên cấp phát theo bội số 2 rồi tái dùng.
    const capacity = Math.max(16, 1 << Math.ceil(Math.log2(Math.max(1, needed))))
    const geo = group?.mesh.geometry ?? geoFactory()
    if (group) {
      this.scene.remove(group.mesh)
      group.mesh.dispose()
    }
    const mesh = new THREE.InstancedMesh(geo, toonVertexColors(), capacity)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.count = 0
    mesh.frustumCulled = false
    this.scene.add(mesh)
    group = { mesh, capacity }
    map.set(key, group)
    return group
  }

  private rebuildProps(): void {
    const counts = new Map<PropKind, number>()
    for (const tile of this.grid.tiles) {
      if (tile.prop) counts.set(tile.prop, (counts.get(tile.prop) ?? 0) + 1)
    }

    for (const kind of PROP_KINDS) {
      const needed = counts.get(kind) ?? 0
      const group = this.ensureGroup(
        this.props,
        kind,
        () => buildPropGeometry(kind),
        needed,
      )
      group.mesh.count = 0
    }

    const cursorIdx = new Map<PropKind, number>()
    for (const tile of this.grid.tiles) {
      if (!tile.prop) continue
      const group = this.props.get(tile.prop)!
      const i = cursorIdx.get(tile.prop) ?? 0
      // Xoay và phóng to nhẹ theo toạ độ để rừng không trông như copy-paste.
      const h = ((tile.x * 73856093) ^ (tile.z * 19349663)) >>> 0
      this.dummy.position.set(tile.x, 0, tile.z)
      this.dummy.rotation.set(0, (h % 360) * 0.0174, 0)
      this.dummy.scale.setScalar(0.86 + ((h >> 8) % 100) / 340)
      this.dummy.updateMatrix()
      group.mesh.setMatrixAt(i, this.dummy.matrix)
      group.mesh.count = i + 1
      cursorIdx.set(tile.prop, i + 1)
    }

    for (const group of this.props.values()) group.mesh.instanceMatrix.needsUpdate = true
  }

  private rebuildCrops(): void {
    const buckets = new Map<string, Array<{ x: number; z: number }>>()
    for (const tile of this.grid.tiles) {
      if (!tile.crop) continue
      const key = `${tile.crop.typeId}:${tile.crop.stage}`
      let list = buckets.get(key)
      if (!list) buckets.set(key, (list = []))
      list.push({ x: tile.x, z: tile.z })
    }

    for (const group of this.crops.values()) group.mesh.count = 0

    for (const [key, list] of buckets) {
      const [typeId, stageStr] = key.split(':')
      const stage = Number(stageStr)
      const group = this.ensureGroup(
        this.crops,
        key,
        () => buildCropGeometry(cropDef(typeId!), stage),
        list.length,
      )
      list.forEach((pos, i) => {
        const h = ((pos.x * 12289) ^ (pos.z * 32771)) >>> 0
        this.dummy.position.set(pos.x, 0.05, pos.z)
        this.dummy.rotation.set(0, (h % 360) * 0.0174, 0)
        this.dummy.scale.setScalar(0.92 + ((h >> 8) % 100) / 620)
        this.dummy.updateMatrix()
        group.mesh.setMatrixAt(i, this.dummy.matrix)
      })
      group.mesh.count = list.length
      group.mesh.instanceMatrix.needsUpdate = true
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.resizeObserver.disconnect()
    this.terrain.dispose()
    for (const g of [...this.props.values(), ...this.crops.values()]) {
      g.mesh.geometry.dispose()
      g.mesh.dispose()
    }
    this.cursor.geometry.dispose()
    ;(this.cursor.material as THREE.Material).dispose()
    this.renderer.dispose()
  }
}

/** Khung viền vuông đánh dấu ô đang nhắm tới. */
function makeTileCursor(): THREE.LineSegments {
  const s = 0.5
  const pts = [
    [-s, 0, -s], [s, 0, -s],
    [s, 0, -s], [s, 0, s],
    [s, 0, s], [-s, 0, s],
    [-s, 0, s], [-s, 0, -s],
  ]
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3))
  const mat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  })
  const lines = new THREE.LineSegments(geo, mat)
  lines.renderOrder = 999
  return lines
}
