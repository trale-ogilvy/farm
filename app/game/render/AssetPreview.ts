import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { PALETTE, toonVertexColors } from './Materials'
import { Sky } from './Sky'
import { addOutlines, INK } from './Outline'
import { buildPlayerRig } from './models/character'
import { bakeModel, loadGltfParts, type GltfPart, type GltfParts } from './models/gltf'
import { findClip, instantiateModel, loadAnimatedModel, type AnimatedModel, type ModelInstance } from './models/petModels'

/**
 * Sân khấu xem asset: một model đặt giữa nền cỏ có lưới ô, chiếu bằng đúng bộ
 * đèn + vòm trời + viền mực của game. Mục đích là trả lời "cái này bỏ vào game
 * trông ra sao" — nên mọi tham số ánh sáng chép nguyên từ SceneManager, không
 * chỉnh cho đẹp riêng ở đây.
 */

export type PreviewMode = 'game' | 'raw'

export interface PreviewOptions {
  /** `game` = nướng vertex color + toon + viền; `raw` = material PBR như trong file. */
  mode: PreviewMode
  scale: number
  outline: boolean
  /** Đặt nhân vật cạnh model để so cỡ. */
  reference: boolean
  autoRotate: boolean
}

export interface PartStats {
  name: string
  tris: number
  color: string
  hasTexture: boolean
}

export interface ModelStats {
  tris: number
  verts: number
  /** Kích thước gốc trong file (chưa nhân scale). */
  size: [number, number, number]
  /** Bề ngang lớn nhất, để tính scale "vừa một ô". */
  footprint: number
  parts: PartStats[]
  /** Model có xương: tên các clip animation (rỗng với prop). */
  clips: string[]
}

const GROUND_RADIUS = 5

export class AssetPreview {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private sky = new Sky()
  private sun: THREE.DirectionalLight
  private stage = new THREE.Group()
  private reference: THREE.Group
  private resizeObserver: ResizeObserver
  private raf = 0
  private opts: PreviewOptions = { mode: 'game', scale: 1, outline: true, reference: true, autoRotate: false }
  private parts: GltfPart[] = []
  /** Model có xương đi đường riêng: giữ skeleton, chạy clip thay vì nướng geometry. */
  private animated: AnimatedModel | null = null
  private instance: ModelInstance | null = null
  private clipName: string | null = null
  private clock = new THREE.Clock()
  private token = 0

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400)
    this.camera.position.set(4, 3, 5)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02
    this.controls.target.set(0, 0.6, 0)

    this.scene.fog = new THREE.FogExp2(0xbfe4f5, 0.016)
    this.scene.add(this.sky.mesh)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.92))
    this.scene.add(new THREE.HemisphereLight(0xdcf0ff, 0x9bb06e, 0.45))

    this.sun = new THREE.DirectionalLight(0xfff6e4, 0.85)
    this.sun.position.set(20, 30, 11)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 100
    const r = 8
    this.sun.shadow.camera.left = -r
    this.sun.shadow.camera.right = r
    this.sun.shadow.camera.top = r
    this.sun.shadow.camera.bottom = -r
    this.sun.shadow.bias = -0.0015
    this.sun.shadow.normalBias = 0.04
    this.scene.add(this.sun)

    this.scene.add(buildGround())
    this.scene.add(this.stage)

    this.reference = buildPlayerRig().root
    this.reference.position.set(1.6, 0, 0.4)
    this.reference.rotation.y = -0.6
    this.scene.add(this.reference)

    this.sky.update(1, this.camera)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas.parentElement ?? canvas)
    this.resize()
    this.loop()
  }

  /** Tải file và dựng lên sân khấu. Trả về số liệu của model, hoặc null nếu bị gọi đè. */
  async load(url: string): Promise<ModelStats | null> {
    const token = ++this.token
    const skinned = await hasSkeleton(url)
    if (token !== this.token) return null

    if (skinned) {
      const model = await loadAnimatedModel(url)
      if (token !== this.token) return null
      this.clearStage()
      this.parts = []
      this.animated = model
      this.clipName = model.clips[0]?.name ?? null
      this.rebuild()
      this.frame()
      return measureAnimated(model)
    }

    const parts = await loadGltfParts(url)
    if (token !== this.token) return null
    this.clearStage()
    this.animated = null
    this.parts = [...parts.values()]
    this.rebuild()
    this.frame()
    return measure(parts)
  }

  /** Đổi clip đang chạy (chỉ có tác dụng với model có xương). */
  playClip(name: string): void {
    this.clipName = name
    if (!this.instance) return
    this.instance.mixer.stopAllAction()
    const clip = findClip(this.instance.clips, name)
    if (clip) this.instance.mixer.clipAction(clip).reset().play()
  }

  setOptions(opts: Partial<PreviewOptions>): void {
    const needsRebuild =
      (opts.mode !== undefined && opts.mode !== this.opts.mode) ||
      (opts.scale !== undefined && opts.scale !== this.opts.scale) ||
      (opts.outline !== undefined && opts.outline !== this.opts.outline)
    Object.assign(this.opts, opts)
    this.reference.visible = this.opts.reference
    this.controls.autoRotate = this.opts.autoRotate
    this.controls.autoRotateSpeed = 1.5
    if (needsRebuild && (this.parts.length || this.animated)) this.rebuild()
  }

  private rebuild(): void {
    this.clearStage()
    const { mode, scale, outline } = this.opts
    if (this.animated) {
      // `scale` là hệ số nhân lên cỡ gốc, quy về chiều cao vì instantiateModel nhận chiều cao.
      const pose = findClip(this.animated.clips, this.clipName ?? undefined)
      const height = this.animated.box.getSize(new THREE.Vector3()).y * scale
      this.instance = instantiateModel(this.animated, height, 0, outline, pose)
      this.stage.add(this.instance.root)
      if (this.clipName) this.playClip(this.clipName)
      return
    }
    if (mode === 'game') {
      const geo = bakeModel(this.parts, scale)
      const mesh = new THREE.Mesh(geo, toonVertexColors())
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (outline) addOutlines(mesh, 0.03)
      this.stage.add(mesh)
      return
    }
    // Raw: dựng đúng như file, chỉ dời cả cụm về giữa như bakeModel làm.
    const group = new THREE.Group()
    const box = new THREE.Box3()
    for (const part of this.parts) {
      const mat = new THREE.MeshStandardMaterial({ color: part.color, map: part.map })
      const mesh = new THREE.Mesh(part.geometry, mat)
      mesh.castShadow = true
      group.add(mesh)
      part.geometry.computeBoundingBox()
      box.union(part.geometry.boundingBox!)
    }
    group.position.set(-(box.min.x + box.max.x) / 2, box.min.y > 0 ? -box.min.y : 0, -(box.min.z + box.max.z) / 2)
    group.position.multiplyScalar(scale)
    group.scale.setScalar(scale)
    this.stage.add(group)
  }

  /**
   * Đưa camera về khung nhìn ôm trọn model lẫn nhân vật so cỡ, giữ nguyên góc
   * nhìn đang có. Cận dưới 4 đơn vị để model nhỏ không bị phóng to lên như kính lúp.
   */
  frame(): void {
    const box = new THREE.Box3().setFromObject(this.stage)
    if (box.isEmpty()) return
    if (this.reference.visible) box.expandByObject(this.reference)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const radius = Math.max(size.x, size.y, size.z) * 0.6
    const dist = Math.max(4, (radius / Math.sin((this.camera.fov * Math.PI) / 360)) * 1.25)
    const dir = this.camera.position.clone().sub(this.controls.target).normalize()
    this.controls.target.set(0, center.y, 0)
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist)
    this.controls.update()
  }

  private clearStage(): void {
    if (this.instance) {
      this.instance.mixer.stopAllAction()
      this.instance = null
    }
    for (const child of [...this.stage.children]) {
      child.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (!mesh.isMesh) return
        // Geometry của raw mode và của model có xương là của cache, không được dispose.
        if (this.animated) return
        if (this.opts.mode === 'game' && !mesh.userData.isOutline) mesh.geometry.dispose()
        if (this.opts.mode === 'raw') (mesh.material as THREE.Material).dispose()
      })
      this.stage.remove(child)
    }
  }

  private resize(): void {
    const el = this.canvas.parentElement ?? this.canvas
    const w = Math.max(1, el.clientWidth)
    const h = Math.max(1, el.clientHeight)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop)
    const dt = this.clock.getDelta()
    this.instance?.mixer.update(dt)
    this.controls.update()
    this.sky.mesh.position.copy(this.camera.position)
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.clearStage()
    this.sky.dispose()
    this.renderer.dispose()
  }
}

/** Đĩa cỏ với lưới ô 1 đơn vị — cùng cỡ ô của game, để đọc ngay model to bằng mấy ô. */
function buildGround(): THREE.Group {
  const g = new THREE.Group()
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(GROUND_RADIUS, 48),
    new THREE.MeshToonMaterial({ color: PALETTE.grassLight }),
  )
  disc.rotation.x = -Math.PI / 2
  disc.receiveShadow = true
  g.add(disc)

  const pts: number[] = []
  const n = Math.floor(GROUND_RADIUS)
  for (let i = -n; i <= n; i++) {
    const half = Math.sqrt(GROUND_RADIUS * GROUND_RADIUS - i * i)
    pts.push(i, 0.005, -half, i, 0.005, half, -half, 0.005, i, half, 0.005, i)
  }
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)),
    new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.22 }),
  )
  g.add(lines)

  // Ô trung tâm tô đậm hơn: model đặt đúng lên ô này.
  const tile = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshToonMaterial({ color: PALETTE.soil }))
  tile.rotation.x = -Math.PI / 2
  tile.position.y = 0.003
  tile.receiveShadow = true
  g.add(tile)

  // Mũi tên chỉ +Z — hướng "mặt" mà game quy ước; model có xương phải quay về đây.
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 3), new THREE.MeshToonMaterial({ color: PALETTE.roof }))
  arrow.rotation.x = Math.PI / 2
  arrow.position.set(0, 0.01, 0.75)
  g.add(arrow)
  return g
}

/**
 * Nhìn vào JSON của file xem có `skins` không, để chọn đường dựng. Đọc riêng
 * thay vì tải cả model rồi mới biết, vì hai đường dùng hai loader/cache khác nhau.
 */
async function hasSkeleton(url: string): Promise<boolean> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  let json: { skins?: unknown[] }
  if (/\.glb$/i.test(url)) {
    const buf = await res.arrayBuffer()
    const view = new DataView(buf)
    const len = view.getUint32(12, true)
    json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, len)))
  } else {
    json = await res.json()
  }
  return (json.skins?.length ?? 0) > 0
}

function measureAnimated(model: AnimatedModel): ModelStats {
  let tris = 0
  let verts = 0
  const parts: PartStats[] = []
  model.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || mesh.userData.isOutline) return
    const geo = mesh.geometry
    const t = Math.round((geo.index ? geo.index.count : geo.getAttribute('position').count) / 3)
    tris += t
    verts += geo.getAttribute('position').count
    const mat = mesh.material as THREE.MeshToonMaterial
    parts.push({
      name: mesh.name,
      tris: t,
      color: '#' + (mat.color?.getHex() ?? 0xffffff).toString(16).padStart(6, '0'),
      hasTexture: !!mat.map,
    })
  })
  const size = model.box.getSize(new THREE.Vector3())
  return {
    tris,
    verts,
    size: [size.x, size.y, size.z],
    footprint: Math.max(size.x, size.z),
    parts,
    clips: model.clips.map((c) => c.name),
  }
}

function measure(parts: GltfParts): ModelStats {
  const box = new THREE.Box3()
  let tris = 0
  let verts = 0
  const out: PartStats[] = []
  for (const [name, part] of parts) {
    const geo = part.geometry
    geo.computeBoundingBox()
    box.union(geo.boundingBox!)
    const t = Math.round((geo.index ? geo.index.count : geo.getAttribute('position').count) / 3)
    tris += t
    verts += geo.getAttribute('position').count
    out.push({ name, tris: t, color: '#' + part.color.toString(16).padStart(6, '0'), hasTexture: !!part.map })
  }
  const size = box.getSize(new THREE.Vector3())
  return {
    tris,
    verts,
    size: [size.x, size.y, size.z],
    footprint: Math.max(size.x, size.z),
    parts: out,
    clips: [],
  }
}
