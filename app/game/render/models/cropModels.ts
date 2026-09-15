import type * as THREE from 'three'
import type { CropDef } from '../../types'
import { bakePart, footprint, loadGltfParts, type GltfPart } from './gltf'

/**
 * Cây trồng dựng từ model glTF thay vì ghép khối.
 *
 * `CropDef.model` trỏ vào một khoá ở đây. Mỗi giai đoạn (trừ giai đoạn 0 —
 * mầm chung, vẫn dựng bằng code) ứng với một mesh: hoặc mỗi giai đoạn một
 * file (asset pack), hoặc nhiều mesh trong cùng một file (`mesh` chọn theo tên
 * node). `color` có thì tô phẳng bằng màu của cây (`leaf`/`fruit`), không thì
 * lấy màu từ texture của model.
 */
interface CropModelStage {
  url: string
  mesh?: string
  color?: 'leaf' | 'fruit'
}

interface CropModelDef {
  /**
   * Tỉ lệ co model về đơn vị ô. Hoặc `scale` cố định (asset pack đã thống nhất
   * cỡ giữa các cây, giữ nguyên tỉ lệ đó thì ngô cao hơn cà rốt đúng như tác
   * giả vẽ), hoặc `width` — bề ngang mà mesh rộng nhất được co về.
   */
  scale?: number
  width?: number
  /** false = không vẽ viền mực (model dày đặc, viền chỉ thành mảng đen). */
  outline?: boolean
  stages: CropModelStage[]
}

const KIT = '/models/farmkit/GLTF/Farm Crop Step'

/**
 * Ô đất của asset pack rộng 2 đơn vị, ô của ta rộng 1. Cây trong pack cố ý
 * xoè rộng hơn ô (ngô rộng 3.1) để lá các ô cạnh nhau đan vào nhau.
 */
const KIT_SCALE = 0.5

/** Ba bước lớn của asset pack, cùng một quy ước tên. */
function kitSteps(name: string): CropModelStage[] {
  return [1, 2, 3].map((n) => ({ url: `${KIT}/Farm_Crop_${name}_Step_0${n}.glb` }))
}

const CROP_MODELS: Record<string, CropModelDef> = {
  carrot: { scale: KIT_SCALE, stages: kitSteps('Carrot') },
  broccoli: { scale: KIT_SCALE, stages: kitSteps('Broccoli') },
  cauliflower: { scale: KIT_SCALE, stages: kitSteps('Cauliflower') },
  sunflower: { scale: KIT_SCALE, stages: kitSteps('Sunflower') },
  // Pack đặt tên "Mashroom", và bước lớn của nấm mang số bộ 02.
  mushroom: { scale: KIT_SCALE, stages: kitSteps('Mashroom_02') },
  wheat1: {
    width: 1,
    outline: false,
    // File chứa sẵn ba bụi lúa cạnh nhau: non (xanh), đang ngậm đòng, chín.
    stages: [
      { url: '/models/wheat1/wheat1.glb', mesh: 'Cube001_Material002_0', color: 'leaf' },
      { url: '/models/wheat1/wheat1.glb', mesh: 'Cube002_Material003_0', color: 'fruit' },
      { url: '/models/wheat1/wheat1.glb', mesh: 'Cube_Material001_0', color: 'fruit' },
    ],
  },
}

/** Geometry đã nướng, theo `${cropId}:${stage}`. Chỉ có sau khi tải xong. */
const baked = new Map<string, THREE.BufferGeometry>()
const loading = new Map<string, Promise<void>>()

async function loadStage(stage: CropModelStage): Promise<GltfPart> {
  const parts = await loadGltfParts(stage.url)
  const part = stage.mesh ? parts.get(stage.mesh) : parts.values().next().value
  if (!part) throw new Error(`${stage.url}: không có mesh "${stage.mesh ?? '(đầu tiên)'}"`)
  return part
}

/**
 * Tải model của một cây và nướng sẵn mọi giai đoạn. Gọi nhiều lần vô hại.
 * Resolve xong thì `cropModelGeometry` bắt đầu trả kết quả.
 */
export function preloadCropModel(def: CropDef): Promise<void> {
  const model = def.model ? CROP_MODELS[def.model] : undefined
  if (!model) return Promise.resolve()

  let hit = loading.get(def.id)
  if (hit) return hit

  hit = Promise.all(model.stages.map(loadStage)).then((parts) => {
    const scale = model.scale ?? (model.width ?? 1) / Math.max(...parts.map(footprint))
    for (let stage = 1; stage < def.stages; stage++) {
      const idx = modelStageIndex(def, model, stage)
      const spec = model.stages[idx]!
      const color = spec.color === 'leaf' ? def.colorLeaf : spec.color === 'fruit' ? def.colorFruit : undefined
      baked.set(`${def.id}:${stage}`, bakePart(parts[idx]!, scale, color, { outline: model.outline }))
    }
  })
  loading.set(def.id, hit)
  return hit
}

/** Giai đoạn 1..stages-1 của cây trải đều lên danh sách mesh của model. */
function modelStageIndex(def: CropDef, model: CropModelDef, stage: number): number {
  const span = Math.max(1, def.stages - 2)
  return Math.round(((stage - 1) / span) * (model.stages.length - 1))
}

/** Geometry model cho một giai đoạn, hoặc null nếu chưa tải xong / không có. */
export function cropModelGeometry(def: CropDef, stage: number): THREE.BufferGeometry | null {
  return baked.get(`${def.id}:${stage}`) ?? null
}
