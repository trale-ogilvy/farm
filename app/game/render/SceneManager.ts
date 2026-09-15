import * as THREE from 'three'
import type { Grid } from '../world/Grid'
import type { PropKind } from '../types'
import { cropDef } from '../data/crops'
import { TerrainMesh } from './TerrainMesh'
import { CameraRig } from './CameraRig'
import { Sky } from './Sky'
import { GrassField } from './GrassField'
import { buildPropGeometry } from './models/props'
import { buildCropGeometry } from './models/crops'
import { toonVertexColors } from './Materials'
import { INK, makeInstancedOutline } from './Outline'

const PROP_KINDS: PropKind[] = ['tree', 'rock', 'bush', 'stump']

interface InstancedGroup {
  mesh: THREE.InstancedMesh
  outline: THREE.InstancedMesh
  capacity: number
}

/**
 * Sở hữu toàn bộ tầng three.js. Không chứa luật chơi — nó chỉ đọc `Grid` và
 * danh sách entity rồi vẽ ra. Nhờ vậy có thể thay renderer mà không đụng gameplay.
 */
export class SceneManager {
  readonly scene = new THREE.Scene()
  readonly renderer: THREE.WebGLRenderer
  readonly rig: CameraRig
  readonly entityLayer = new THREE.Group()

  private terrain: TerrainMesh
  private sky = new Sky()
  private grass: GrassField
  private props = new Map<string, InstancedGroup>()
  private crops = new Map<string, InstancedGroup>()
  private cursor: THREE.LineSegments
  private cursorPos = new Float32Array(24)
  private sun: THREE.DirectionalLight
  private hemi: THREE.HemisphereLight
  private ambient: THREE.AmbientLight
  private dummy = new THREE.Object3D()
  private raycaster = new THREE.Raycaster()
  private resizeObserver: ResizeObserver
  private pickCache: { x: number; z: number } | null = null
  private projected = new THREE.Vector3()

  get camera(): THREE.PerspectiveCamera {
    return this.rig.camera
  }

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

    this.rig = new CameraRig(grid)

    // Fog mũ: vật ở xa tan dần vào màu chân trời. Đây là nửa còn lại của cảm
    // giác không gian mở, nửa kia là vòm trời gradient.
    this.scene.fog = new THREE.FogExp2(0xbfe4f5, 0.016)
    this.scene.add(this.sky.mesh)

    // Ánh sáng môi trường mạnh + mặt trời yếu: bề mặt gần như không đổ gradient,
    // hình khối đọc ra nhờ NÉT MỰC chứ không nhờ sáng tối. Đây là điểm khác cốt
    // lõi so với cel-shading thường, vốn vẫn dựa vào chuyển sáng để tả khối.
    this.ambient = new THREE.AmbientLight(0xffffff, 0.92)
    this.scene.add(this.ambient)

    // Ánh sáng bán cầu trời-đất: cho vùng khuất sáng ngả xanh lá hắt lên từ cỏ,
    // thay vì xám chết như khi chỉ có ambient trắng.
    this.hemi = new THREE.HemisphereLight(0xdcf0ff, 0x9bb06e, 0.45)
    this.scene.add(this.hemi)

    this.sun = new THREE.DirectionalLight(0xfff6e4, 0.85)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 140
    this.sun.shadow.bias = -0.0015
    this.sun.shadow.normalBias = 0.04
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    this.terrain = new TerrainMesh(grid)
    this.scene.add(
      this.terrain.mesh,
      this.terrain.plotsOutline,
      this.terrain.plots,
      this.terrain.water,
    )

    this.grass = new GrassField(grid)
    this.scene.add(this.grass.mesh)

    this.scene.add(this.entityLayer)

    this.cursor = makeTileCursor(this.cursorPos)
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
    this.rig.setAspect(w / h)
  }

  zoomBy(delta: number): void {
    this.rig.zoom(delta)
  }

  rotateBy(dx: number, dy: number): void {
    this.rig.rotate(dx, dy)
  }

  /** Camera bám theo người chơi. `y` là cao độ mặt đất dưới chân nhân vật. */
  followTarget(x: number, y: number, z: number, dt: number, instant = false): void {
    this.rig.update(x, y, z, dt, instant)
    this.pickCache = null

    // Shadow camera bám theo tầm nhìn chứ không phủ cả bản đồ — giữ độ nét bóng.
    const focus = this.rig.focusPoint
    const r = 6 + this.rig.distance * 1.1
    const sc = this.sun.shadow.camera
    sc.left = -r
    sc.right = r
    sc.top = r
    sc.bottom = -r
    sc.updateProjectionMatrix()
    this.sun.target.position.copy(focus)
    this.sun.target.updateMatrixWorld()
  }

  snapCameraTo(x: number, y: number, z: number): void {
    this.followTarget(x, y, z, 0, true)
  }

  /** Cập nhật ánh sáng và bầu trời theo giờ trong game. */
  updateLighting(daylight: number, hour: number, elapsedSeconds: number): void {
    const focus = this.rig.focusPoint
    const angle = ((hour - 6) / 24) * Math.PI * 2
    this.sun.position.set(
      focus.x + Math.cos(angle) * 40,
      focus.y + Math.max(14, Math.sin(angle) * 48),
      focus.z + 22,
    )

    const dusk = Math.pow(1 - daylight, 2)
    this.sun.intensity = 0.3 + daylight * 0.62
    this.sun.color.setHSL(0.11 - dusk * 0.05, 0.3 + dusk * 0.35, 0.8)

    // Nền đêm cố ý không tối hẳn: vẫn phải nhìn rõ luống đất để chơi tiếp được.
    this.ambient.intensity = 0.72 + daylight * 0.24
    this.hemi.intensity = 0.34 + daylight * 0.2

    const horizon = this.sky.update(daylight, this.camera)
    const fog = this.scene.fog as THREE.FogExp2
    fog.color.copy(horizon)
    // Đêm sương dày hơn chút, tầm nhìn co lại cho có không khí.
    fog.density = 0.007 + (1 - daylight) * 0.005

    this.terrain.update(elapsedSeconds)
    this.grass.update(elapsedSeconds)
  }

  /**
   * Ô dưới con trỏ chuột. Bắn tia thẳng vào mesh địa hình thay vì vào một mặt
   * phẳng y=0 — với đồi núi thì mặt phẳng cho kết quả sai hẳn.
   */
  pickTile(ndcX: number, ndcY: number, moved: boolean): { x: number; z: number } | null {
    if (!moved && this.pickCache) return this.pickCache

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera)
    const hits = this.raycaster.intersectObject(this.terrain.mesh, false)
    if (!hits.length) return (this.pickCache = null)

    const p = hits[0]!.point
    const x = Math.round(p.x)
    const z = Math.round(p.z)
    this.pickCache = this.grid.inBounds(x, z) ? { x, z } : null
    return this.pickCache
  }

  setCursor(tile: { x: number; z: number } | null, valid: boolean): void {
    if (!tile) {
      this.cursor.visible = false
      return
    }
    this.cursor.visible = true

    // Khung viền phải uốn theo độ cao 4 góc, nếu không nó sẽ cắm vào sườn đồi.
    const H = this.grid.heights
    const { x, z } = tile
    const c = [
      [x, z],
      [x + 1, z],
      [x + 1, z + 1],
      [x, z + 1],
    ] as const
    const lift = 0.06
    for (let i = 0; i < 4; i++) {
      const a = c[i]!
      const b = c[(i + 1) % 4]!
      const o = i * 6
      this.cursorPos[o] = a[0] - 0.5
      this.cursorPos[o + 1] = H.corner(a[0], a[1]) + lift
      this.cursorPos[o + 2] = a[1] - 0.5
      this.cursorPos[o + 3] = b[0] - 0.5
      this.cursorPos[o + 4] = H.corner(b[0], b[1]) + lift
      this.cursorPos[o + 5] = b[1] - 0.5
    }
    this.cursor.geometry.getAttribute('position').needsUpdate = true
    ;(this.cursor.material as THREE.LineBasicMaterial).color.setHex(
      valid ? INK : 0xd9564a,
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
      this.scene.remove(group.mesh, group.outline)
      group.mesh.dispose()
      group.outline.dispose()
    }
    const mesh = new THREE.InstancedMesh(geo, toonVertexColors(), capacity)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.count = 0
    mesh.frustumCulled = false

    // Viền dùng chung instanceMatrix nên tự khớp; chỉ phải nhớ đồng bộ `count`.
    const outline = makeInstancedOutline(mesh, key.includes(':') ? 0.016 : 0.045)
    this.scene.add(outline, mesh)

    group = { mesh, outline, capacity }
    map.set(key, group)
    return group
  }

  private rebuildProps(): void {
    const counts = new Map<PropKind, number>()
    for (const tile of this.grid.tiles) {
      if (tile.prop) counts.set(tile.prop, (counts.get(tile.prop) ?? 0) + 1)
    }

    for (const kind of PROP_KINDS) {
      const group = this.ensureGroup(
        this.props,
        kind,
        () => buildPropGeometry(kind),
        counts.get(kind) ?? 0,
      )
      group.mesh.count = 0
    }

    const cursorIdx = new Map<PropKind, number>()
    for (const tile of this.grid.tiles) {
      if (!tile.prop) continue
      const group = this.props.get(tile.prop)!
      const i = cursorIdx.get(tile.prop) ?? 0
      group.outline.count = i + 1
      // Xoay và phóng to nhẹ theo toạ độ để rừng không trông như copy-paste.
      const h = ((tile.x * 73856093) ^ (tile.z * 19349663)) >>> 0
      this.dummy.position.set(
        tile.x,
        this.grid.heights.tileHeight(tile.x, tile.z),
        tile.z,
      )
      this.dummy.rotation.set(0, (h % 360) * 0.0174, 0)
      this.dummy.scale.setScalar(0.86 + ((h >> 8) % 100) / 340)
      this.dummy.updateMatrix()
      group.mesh.setMatrixAt(i, this.dummy.matrix)
      group.mesh.count = i + 1
      cursorIdx.set(tile.prop, i + 1)
    }

    for (const group of this.props.values()) {
      group.mesh.instanceMatrix.needsUpdate = true
      group.outline.count = group.mesh.count
    }
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

    for (const group of this.crops.values()) {
      group.mesh.count = 0
      group.outline.count = 0
    }

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
        this.dummy.position.set(
          pos.x,
          this.grid.heights.tileHeight(pos.x, pos.z) + 0.06,
          pos.z,
        )
        this.dummy.rotation.set(0, (h % 360) * 0.0174, 0)
        this.dummy.scale.setScalar(0.92 + ((h >> 8) % 100) / 620)
        this.dummy.updateMatrix()
        group.mesh.setMatrixAt(i, this.dummy.matrix)
      })
      group.mesh.count = list.length
      group.outline.count = list.length
      group.mesh.instanceMatrix.needsUpdate = true
    }
  }

  /**
   * Chiếu một điểm thế giới ra toạ độ pixel trên canvas.
   *
   * Bong bóng hành động là phần tử HTML chứ không phải sprite 3D: chữ nét căng
   * ở mọi khoảng cách, và dùng lại được đúng kiểu giấy-mực của HUD.
   */
  projectToScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = this.projected.set(x, y, z).project(this.camera)
    const el = this.renderer.domElement
    return {
      x: (v.x * 0.5 + 0.5) * el.clientWidth,
      y: (-v.y * 0.5 + 0.5) * el.clientHeight,
      // z ngoài [-1,1] nghĩa là điểm nằm sau camera hoặc quá xa.
      visible: v.z > -1 && v.z < 1,
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.resizeObserver.disconnect()
    this.terrain.dispose()
    this.sky.dispose()
    this.grass.dispose()
    for (const g of [...this.props.values(), ...this.crops.values()]) {
      g.mesh.geometry.dispose()
      g.mesh.dispose()
      g.outline.dispose()
    }
    this.cursor.geometry.dispose()
    ;(this.cursor.material as THREE.Material).dispose()
    this.renderer.dispose()
  }
}

/** Khung viền đánh dấu ô đang nhắm tới; toạ độ được cập nhật theo địa hình. */
function makeTileCursor(buffer: Float32Array): THREE.LineSegments {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(buffer, 3))
  const mat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  })
  const lines = new THREE.LineSegments(geo, mat)
  lines.renderOrder = 999
  lines.frustumCulled = false
  return lines
}
