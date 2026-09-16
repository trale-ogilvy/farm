import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneWithSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { toon, toonTextured } from '../Materials'
import { addOutlines } from '../Outline'

/**
 * Pet dựng từ model glTF có xương + animation, thay cho rig ghép khối.
 *
 * Khác với prop/cây (nướng thành geometry tĩnh), pet phải giữ nguyên skeleton
 * để chạy clip. Vậy nên model được giữ nguyên cây node, chỉ đổi material sang
 * toon có texture và gắn viền mực dạng SkinnedMesh. Màu của texture được làm
 * dịu bằng canvas filter — cùng ý với `soften()` ở gltf.ts nhưng chạy trên GPU
 * vì texture 2048² xử lý từng pixel sẽ khựng cả giây.
 */

/** Trạng thái hoạt ảnh mà PetSystem yêu cầu; model không có clip thì rơi về idle. */
export type PetAnim = 'idle' | 'walk' | 'run' | 'work' | 'rest' | 'stunned'

export interface PetModelDef {
  url: string
  /** Chiều cao mục tiêu tính bằng ô, đo ở tư thế bind. */
  height: number
  /** Xoay thêm quanh Y (radian) để model nhìn về +Z như rig ghép khối. */
  yaw?: number
  /** Đuôi tên clip cho từng trạng thái — so khớp không phân biệt hoa thường. */
  clips: Partial<Record<PetAnim, string>>
}

/** Bộ clip chuẩn của pack Palworld: `SK_X.ao|AS_X_<tên>`. */
const PALWORLD: PetModelDef['clips'] = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Run',
  work: 'CommonWork',
  rest: 'SleepLoop',
  stunned: 'Damage',
}

const PETS_DIR = '/models/pets'

export const PET_MODELS: Record<string, PetModelDef> = {
  frog: {
    url: '/models/frog_pet/scene.gltf',
    height: 0.55,
    clips: { idle: 'stand', walk: 'run', run: 'run', stunned: 'gethit' },
  },
  chillet: { url: `${PETS_DIR}/chillet/scene.gltf`, height: 0.35, clips: { ...PALWORLD, work: 'Eat' } },
  mossanda: { url: `${PETS_DIR}/palworld_-_033_mossanda/scene.gltf`, height: 1.5, clips: { ...PALWORLD, work: 'Planting' } },
  caprity: { url: `${PETS_DIR}/palworld_-_035_caprity/scene.gltf`, height: 0.95, clips: { ...PALWORLD, work: 'Planting' } },
  lunaris: { url: `${PETS_DIR}/pc___computer_-_palworld_-_pals_-_063_lunaris/scene.gltf`, height: 1.0, clips: PALWORLD },
  katress: { url: `${PETS_DIR}/pc___computer_-_palworld_-_pals_-_075_katress/scene.gltf`, height: 1.0, clips: PALWORLD },
  direhowl: { url: `${PETS_DIR}/pc_computer_-_palworld_-_026_direhowl/scene.gltf`, height: 0.8, clips: { ...PALWORLD, work: 'Eat' } },
  univolt: { url: `${PETS_DIR}/univolt/scene.gltf`, height: 1.2, clips: { ...PALWORLD, work: 'Eat' } },
}

/** Model đã tải và toon hoá, dùng làm khuôn để nhân bản. */
export interface AnimatedModel {
  scene: THREE.Group
  clips: THREE.AnimationClip[]
  /** Hộp bao ở tư thế bind, toạ độ của `scene`. */
  box: THREE.Box3
  /** Kết quả lấy mẫu từng clip (xem `sampleClip`), cache theo tên clip. */
  samples: Map<string, ClipSample>
}

/** Những gì đo được khi chạy thử một clip trên khuôn (chưa nhân tỉ lệ). */
export interface ClipSample {
  /** Hợp hộp bao của các frame lấy mẫu. */
  box: THREE.Box3
  /** Sải chân: quãng xa nhất mà bàn chân đi được dọc trục nhìn trong một chu kỳ. */
  stride: number
}

/** Một bản của model đặt vào thế giới: đã co về đúng cỡ, chân chạm y=0, có viền. */
export interface ModelInstance {
  root: THREE.Group
  mixer: THREE.AnimationMixer
  clips: THREE.AnimationClip[]
  /** Tỉ lệ đã áp — cần để quy đổi độ dày viền, thickness tính trong không gian model. */
  scale: number
}

const loader = new GLTFLoader()
const cache = new Map<string, Promise<AnimatedModel>>()

/** Tải + toon hoá một file, cache theo URL. Dùng được cho mọi model có xương, không riêng pet. */
export function loadAnimatedModel(url: string): Promise<AnimatedModel> {
  let hit = cache.get(url)
  if (hit) return hit
  hit = loader.loadAsync(url).then(async (gltf) => {
    await restoreSpecGlossTextures(gltf)
    toonify(gltf.scene)
    gltf.scene.updateMatrixWorld(true)
    // precise = true: với SkinnedMesh, hộp bao tính qua ma trận xương thay vì
    // geometry thô — geometry của Sketchfab nằm ở không gian khác hẳn.
    const box = new THREE.Box3().setFromObject(gltf.scene, true)
    return { scene: gltf.scene, clips: gltf.animations, box, samples: new Map() }
  })
  cache.set(url, hit)
  return hit
}

/**
 * Chạy thử `clip` trên khuôn, lấy vài frame rải đều trong chu kỳ.
 *
 * - Hộp bao: tư thế bind của Sketchfab thường là A-pose chân dang thấp hơn lúc
 *   đi; dời theo nó thì sang clip Walk chân co lên và con vật lơ lửng. Đo bằng
 *   chính clip thì đáy hộp là chỗ chân thật sự chạm đất.
 * - Sải chân: clip đi tại chỗ, nên bàn chân đưa tới rồi kéo lui đúng một sải
 *   mỗi chu kỳ. Sải ÷ thời lượng = tốc độ mà clip "muốn" thân di chuyển; đi
 *   nhanh hơn thế là trượt chân, chậm hơn là moonwalk.
 *
 * Đo trên khuôn, cache theo clip.
 */
export function sampleClip(model: AnimatedModel, clip: THREE.AnimationClip | null): ClipSample {
  if (!clip) return { box: model.box, stride: 0 }
  const hit = model.samples.get(clip.name)
  if (hit) return hit

  const bones: THREE.Bone[] = []
  model.scene.traverse((o) => (o as THREE.Bone).isBone && bones.push(o as THREE.Bone))
  const track = bones.map(() => ({ y: 0, zMin: Infinity, zMax: -Infinity }))

  const mixer = new THREE.AnimationMixer(model.scene)
  const action = mixer.clipAction(clip).play()
  const box = new THREE.Box3()
  const v = new THREE.Vector3()
  const SAMPLES = 16
  for (let i = 0; i < SAMPLES; i++) {
    action.time = (clip.duration * i) / SAMPLES
    mixer.update(0)
    model.scene.updateMatrixWorld(true)
    box.union(new THREE.Box3().setFromObject(model.scene, true))
    bones.forEach((b, k) => {
      b.getWorldPosition(v)
      const t = track[k]!
      t.y += v.y / SAMPLES
      t.zMin = Math.min(t.zMin, v.z)
      t.zMax = Math.max(t.zMax, v.z)
    })
  }
  // Xương của khuôn giữ nguyên frame cuối vừa lấy mẫu — vô hại, vì mỗi bản
  // nhân ra đều có mixer riêng đè lên ngay.
  mixer.stopAllAction()
  mixer.uncacheRoot(model.scene)

  // Bàn chân: ưu tiên xương có tên, không thì lấy mấy xương thấp nhất có cử
  // động (bỏ root/IK nằm ngay mặt đất và không nhúc nhích).
  const height = box.max.y - box.min.y
  const moving = bones
    .map((b, k) => ({ name: b.name, ...track[k]! }))
    .filter((t) => t.zMax - t.zMin > height * 0.01 && t.y > box.min.y + height * 0.02)
  const named = moving.filter((t) => /foot|toe|paw|ankle/i.test(t.name))
  const feet = named.length ? named : moving.sort((a, b) => a.y - b.y).slice(0, 6)
  const stride = feet.reduce((m, t) => Math.max(m, t.zMax - t.zMin), 0)

  const sample = { box, stride }
  model.samples.set(clip.name, sample)
  return sample
}

/**
 * Nhân bản khuôn (SkeletonUtils để xương đi theo), co về `height`, dời chân
 * xuống y=0 và căn giữa x/z. Hộp bao đo theo `poseClip` (thường là Walk) —
 * xem `sampleClip`. `yaw` xoay trước khi đo nên hộp bao khớp với hướng nhìn cuối cùng.
 */
export function instantiateModel(
  model: AnimatedModel,
  height: number,
  yaw = 0,
  outline = true,
  poseClip: THREE.AnimationClip | null = null,
): ModelInstance {
  const body = cloneWithSkeleton(model.scene) as THREE.Group
  const { box } = sampleClip(model, poseClip)
  const size = box.getSize(new THREE.Vector3())
  const scale = height / Math.max(size.y, 1e-3)
  const center = box.getCenter(new THREE.Vector3())

  // Nhóm trong cùng chỉ dịch, nhóm ngoài xoay + co: thứ tự này giữ cho tâm hộp
  // bao nằm đúng trục xoay.
  const pivot = new THREE.Group()
  body.position.set(-center.x, -box.min.y, -center.z)
  pivot.add(body)
  pivot.rotation.y = yaw
  pivot.scale.setScalar(scale)

  const root = new THREE.Group()
  root.add(pivot)

  // Viền dày 0.022 ở thế giới như pet ghép khối; model bị co nên phải nở bù.
  if (outline) addOutlines(body, 0.022 / scale)

  const mixer = new THREE.AnimationMixer(body)
  return { root, mixer, clips: model.clips, scale }
}

/** Tìm clip theo đuôi tên (`SK_X.ao|AS_X_Idle` khớp với `Idle`). */
export function findClip(clips: THREE.AnimationClip[], suffix: string | undefined): THREE.AnimationClip | null {
  if (!suffix) return null
  const s = suffix.toLowerCase()
  return clips.find((c) => c.name.toLowerCase().endsWith(s)) ?? null
}

/** Đổi material PBR/unlit sang toon, bật bóng đổ, tắt frustum culling cho mesh có xương. */
function toonify(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial
    const map = src.map ? softenTexture(src.map) : null
    const emissive = src.emissiveMap ? softenTexture(src.emissiveMap) : null
    mesh.material = map
      ? toonTextured(map, src.color?.getHex() ?? 0xffffff, emissive)
      : toon(src.color?.getHex() ?? 0xcccccc)
    mesh.castShadow = true
    // Bounding sphere tính ở tư thế bind; khi chạy animation con vật có thể bị
    // cắt mất lúc ở mép màn hình.
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) mesh.frustumCulled = false
  })
}

/**
 * GLTFLoader đã bỏ hỗ trợ `KHR_materials_pbrSpecularGlossiness` (extension cũ
 * của Sketchfab), nên material ra trắng trơn không texture. Lấy lại
 * `diffuseTexture` từ JSON gốc của file.
 */
async function restoreSpecGlossTextures(gltf: GLTF): Promise<void> {
  const json = gltf.parser.json as {
    materials?: Array<{ extensions?: { KHR_materials_pbrSpecularGlossiness?: { diffuseTexture?: { index: number } } } }>
  }
  const jobs: Promise<void>[] = []
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const mat = mesh.material as THREE.MeshStandardMaterial
    if (mat.map) return
    const index = gltf.parser.associations.get(mat)?.materials
    if (index === undefined) return
    const texIndex = json.materials?.[index]?.extensions?.KHR_materials_pbrSpecularGlossiness?.diffuseTexture?.index
    if (texIndex === undefined) return
    jobs.push(
      gltf.parser.getDependency('texture', texIndex).then((tex: THREE.Texture) => {
        tex.colorSpace = THREE.SRGBColorSpace
        mat.map = tex
      }),
    )
  })
  await Promise.all(jobs)
}

const softened = new Map<THREE.Texture, THREE.Texture>()

/**
 * Kéo texture về tông pastel của cảnh: bớt bão hoà, sáng lên chút. Cùng tinh
 * thần với `soften()` trong gltf.ts, nhưng bằng canvas filter để không phải
 * duyệt từng pixel của texture 2048².
 */
function softenTexture(tex: THREE.Texture): THREE.Texture {
  const hit = softened.get(tex)
  if (hit) return hit
  const img = tex.image as CanvasImageSource & { width: number; height: number }
  if (!img?.width || !img?.height) return tex
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return tex
  ctx.filter = 'saturate(0.78) brightness(1.06)'
  ctx.drawImage(img, 0, 0)

  const out = new THREE.CanvasTexture(canvas)
  out.flipY = tex.flipY
  out.colorSpace = THREE.SRGBColorSpace
  out.wrapS = tex.wrapS
  out.wrapT = tex.wrapT
  out.repeat.copy(tex.repeat)
  out.offset.copy(tex.offset)
  out.channel = tex.channel
  softened.set(tex, out)
  return out
}

// Lúc dev, mở ra console để đo thử clip (window.__petModels).
if (import.meta.dev && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__petModels = { THREE, loadAnimatedModel, sampleClip, findClip, PET_MODELS }
}
