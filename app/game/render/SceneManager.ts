import * as THREE from 'three'
import type { Grid } from '../world/Grid'
import type { PropKind } from '../types'
import { cropDef } from '../data/crops'
import { TerrainMesh } from './TerrainMesh'
import { CameraRig } from './CameraRig'
import { Sky } from './Sky'
import { GrassField } from './GrassField'
import { buildPropGeometry, buildSiteGeometry } from './models/props'
import { buildCropGeometry } from './models/crops'
import { toonVertexColors } from './Materials'
import { cropTransform, plotTransform, propTransform, siteTransform } from './instanceTransforms'
import { GLOW, TargetHighlight, type HighlightTone } from './TargetHighlight'
import { addOutlines, makeInstancedOutline } from './Outline'

/** Các prop vẽ theo lô; nhà chính không nằm đây vì nó là một mesh duy nhất. */
const PROP_KINDS: PropKind[] = ['tree', 'rock', 'bush', 'stump']

/**
 * Mô tả vật thể cần highlight, dưới dạng renderer hiểu được.
 *
 * Cố ý KHÔNG nhận thẳng `ActionTarget` từ tầng systems: renderer chỉ nên biết
 * "vẽ sáng cái cây ở ô này", không cần biết người chơi sắp chặt hay sắp tưới.
 */
export interface HighlightRequest {
  kind: 'plot' | 'crop' | 'prop'
  x: number
  z: number
  /** `${cropId}:${stage}` — khớp với khoá của instanced mesh cây trồng. */
  cropKey?: string
  propKind?: PropKind
}

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
  private highlight = new TargetHighlight()
  private props = new Map<string, InstancedGroup>()
  private crops = new Map<string, InstancedGroup>()
  private sites: InstancedGroup | null = null
  private house: THREE.Mesh
  private buildZone: THREE.Group
  private sun: THREE.DirectionalLight
  private hemi: THREE.HemisphereLight
  private ambient: THREE.AmbientLight
  private dummy = new THREE.Object3D()
  private raycaster = new THREE.Raycaster()
  private resizeObserver: ResizeObserver
  private pickCache: { x: number; z: number; wx: number; wz: number } | null = null
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
      this.terrain.seabed,
      this.terrain.mesh,
      this.terrain.plotsOutline,
      this.terrain.plots,
      this.terrain.water,
    )

    this.grass = new GrassField(grid)
    this.scene.add(this.grass.mesh)

    this.scene.add(this.entityLayer)
    this.scene.add(this.highlight.mesh)

    this.house = this.buildHouse()
    this.scene.add(this.house)
    this.buildZone = this.buildZoneRing()
    this.scene.add(this.buildZone)

    this.rebuildProps()
    this.rebuildSites()

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
    this.highlight.update(elapsedSeconds)
  }

  /**
   * Chỗ con trỏ chuột chỉ xuống mặt đất: ô lưới và điểm chính xác.
   *
   * Bắn tia vào mesh địa hình VÀ mặt nước, lấy hit gần nhất. Không dùng mặt
   * phẳng y=0: bờ biển và lòng ao thấp hơn mặt đảo, chỉ xuống đó bằng mặt
   * phẳng sẽ lệch ô. Mặt nước phải có trong danh sách vì đáy ao nằm sâu dưới
   * mặt nước — bắn xuyên qua nước xuống đáy thì ô dưới con trỏ lệch theo góc nhìn.
   */
  pickGround(ndcX: number, ndcY: number, moved: boolean): typeof this.pickCache {
    if (!moved && this.pickCache) return this.pickCache

    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera)
    const hits = this.raycaster.intersectObjects([this.terrain.mesh, this.terrain.water], false)
    if (!hits.length) return (this.pickCache = null)

    const p = hits[0]!.point
    const x = Math.round(p.x)
    const z = Math.round(p.z)
    this.pickCache = this.grid.inBounds(x, z) ? { x, z, wx: p.x, wz: p.z } : null
    return this.pickCache
  }

  /**
   * Đánh dấu vật thể đang được nhắm. Hình học lấy thẳng từ instanced mesh đang
   * vẽ nó, và vị trí lấy từ đúng hàm transform đã đặt nó ở đó — nên lớp sáng
   * luôn trùng khít, kể cả khi vật thể được xoay và phóng ngẫu nhiên theo toạ độ.
   */
  setHighlight(req: HighlightRequest | null, tone: HighlightTone = 'ok'): void {
    if (!req) {
      this.highlight.hide()
      return
    }

    let geo: THREE.BufferGeometry | undefined
    switch (req.kind) {
      case 'prop':
        geo = req.propKind ? this.props.get(req.propKind)?.mesh.geometry : undefined
        propTransform(this.dummy, this.grid, req.x, req.z)
        break
      case 'crop':
        geo = req.cropKey ? this.crops.get(req.cropKey)?.mesh.geometry : undefined
        cropTransform(this.dummy, this.grid, req.x, req.z)
        break
      default:
        // Ô cỏ chưa cuốc cũng dùng hình đĩa đất — nó thành bản xem trước của
        // mảng đất sắp tạo ra.
        geo = this.terrain.plots.geometry
        plotTransform(this.dummy, this.grid, req.x, req.z)
        break
    }

    if (!geo) {
      this.highlight.hide()
      return
    }
    this.highlight.show(geo, this.dummy.matrix, tone)
  }

  /** Gọi lại khi địa hình hoặc prop thay đổi. */
  refreshWorld(now: number): void {
    this.terrain.rebuild(now)
    this.rebuildProps()
    this.rebuildCrops()
    this.rebuildSites()
    this.grid.dirty.clear()
  }

  private buildHouse(): THREE.Mesh {
    const mesh = new THREE.Mesh(buildPropGeometry('house'), toonVertexColors())
    mesh.castShadow = true
    mesh.receiveShadow = true
    const { x, z } = this.grid.home
    mesh.position.set(x, this.grid.heights.tileHeight(x, z), z)
    mesh.name = 'house'
    addOutlines(mesh, 0.03)
    return mesh
  }

  /**
   * Vòng tròn mờ quanh nhà đánh dấu vùng được xây. Vẽ sát mặt đất bằng vật
   * liệu không chịu ánh sáng và không ghi depth, để nó nằm dưới mọi thứ khác
   * mà không bao giờ chớp với mặt cỏ.
   */
  private buildZoneRing(): THREE.Group {
    const g = new THREE.Group()
    const r = this.grid.buildRadius
    const { x, z } = this.grid.home
    const y = this.grid.heights.tileHeight(x, z) + 0.03

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.22, r, 96),
      new THREE.MeshBasicMaterial({
        color: GLOW,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    )
    const fill = new THREE.Mesh(
      new THREE.CircleGeometry(r - 0.22, 96),
      new THREE.MeshBasicMaterial({
        color: GLOW,
        transparent: true,
        opacity: 0.06,
        depthWrite: false,
      }),
    )
    for (const m of [ring, fill]) {
      m.rotation.x = -Math.PI / 2
      m.position.set(x, y, z)
      m.renderOrder = 1
      g.add(m)
    }
    g.name = 'buildZone'
    return g
  }

  /** Bãi công trình đang chờ xây: một lô instanced như prop, dựng lại khi ô đổi. */
  private rebuildSites(): void {
    const list: Array<{ x: number; z: number }> = []
    for (const tile of this.grid.tiles) if (tile.site) list.push({ x: tile.x, z: tile.z })

    this.sites = this.ensureGroup(
      { get: () => this.sites, set: (g) => (this.sites = g) },
      buildSiteGeometry,
      list.length,
    )
    list.forEach((pos, i) => {
      siteTransform(this.dummy, this.grid, pos.x, pos.z)
      this.sites!.mesh.setMatrixAt(i, this.dummy.matrix)
    })
    this.sites.mesh.count = list.length
    this.sites.outline.count = list.length
    this.sites.mesh.instanceMatrix.needsUpdate = true
  }

  private ensureGroup(
    slot: { get: () => InstancedGroup | undefined | null; set: (g: InstancedGroup) => void },
    geoFactory: () => THREE.BufferGeometry,
    needed: number,
    thinOutline = false,
  ): InstancedGroup {
    let group = slot.get()
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
    const outline = makeInstancedOutline(mesh, thinOutline ? 0.016 : 0.045)
    this.scene.add(outline, mesh)

    group = { mesh, outline, capacity }
    slot.set(group)
    return group
  }

  /** Bộ get/set cho một khoá trong Map, để `ensureGroup` không cần biết Map. */
  private slotIn(map: Map<string, InstancedGroup>, key: string) {
    return { get: () => map.get(key), set: (g: InstancedGroup) => void map.set(key, g) }
  }

  private rebuildProps(): void {
    const counts = new Map<PropKind, number>()
    for (const tile of this.grid.tiles) {
      if (tile.prop) counts.set(tile.prop, (counts.get(tile.prop) ?? 0) + 1)
    }

    for (const kind of PROP_KINDS) {
      const group = this.ensureGroup(
        this.slotIn(this.props, kind),
        () => buildPropGeometry(kind),
        counts.get(kind) ?? 0,
      )
      group.mesh.count = 0
    }

    const cursorIdx = new Map<PropKind, number>()
    for (const tile of this.grid.tiles) {
      if (!tile.prop || tile.prop === 'house') continue
      const group = this.props.get(tile.prop)!
      const i = cursorIdx.get(tile.prop) ?? 0
      group.outline.count = i + 1
      // Xoay và phóng to nhẹ theo toạ độ để rừng không trông như copy-paste.
      propTransform(this.dummy, this.grid, tile.x, tile.z)
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
        this.slotIn(this.crops, key),
        () => buildCropGeometry(cropDef(typeId!), stage),
        list.length,
        true,
      )
      list.forEach((pos, i) => {
        cropTransform(this.dummy, this.grid, pos.x, pos.z)
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
    this.highlight.dispose()
    for (const g of [...this.props.values(), ...this.crops.values(), this.sites]) {
      if (!g) continue
      g.mesh.geometry.dispose()
      g.mesh.dispose()
      g.outline.dispose()
    }
    this.house.geometry.dispose()
    for (const m of this.buildZone.children as THREE.Mesh[]) {
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
    this.renderer.dispose()
  }
}
