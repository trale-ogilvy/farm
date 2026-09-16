import * as THREE from 'three'
import type { PetDef } from '../types'
import { animateWalk, buildPetRig, type Rig } from './models/character'
import {
  findClip,
  instantiateModel,
  loadAnimatedModel,
  PET_MODELS,
  sampleClip,
  type ModelInstance,
  type PetAnim,
} from './models/petModels'
import { setOutlineHighlight } from './Outline'
import type { HighlightTone } from './TargetHighlight'

/** Một clip di chuyển cùng tốc độ mà nó "muốn" thân đi (đơn vị ô/giây). */
interface Gait {
  clip: THREE.AnimationClip
  natural: number
}

/**
 * Phần nhìn thấy được của một pet. PetSystem chỉ đặt vị trí/hướng lên `root`
 * và báo trạng thái hoạt ảnh; bên trong là rig ghép khối hay model có xương
 * thì nó không cần biết.
 *
 * Luôn bắt đầu bằng rig ghép khối. Def có `model` thì tải glTF nền, xong thì
 * tráo vào — tải lỗi hay chậm thì pet vẫn hiện bằng khối như trước.
 */
export class PetView {
  readonly root = new THREE.Group()

  private rig: Rig | null
  private model: ModelInstance | null = null
  private clips: Partial<Record<PetAnim, THREE.AnimationClip | null>> = {}
  private gaits: Gait[] = []
  private action: THREE.AnimationAction | null = null
  private tone: HighlightTone | null = null
  private disposed = false

  constructor(private def: PetDef) {
    this.root.name = `pet:${def.id}`
    this.rig = buildPetRig(def)
    this.root.add(this.rig.root)

    const spec = def.model ? PET_MODELS[def.model] : undefined
    if (!spec) return
    loadAnimatedModel(spec.url)
      .then((model) => {
        if (this.disposed) return
        // Đo cỡ theo clip Walk (hoặc Idle): chân chạm đất đúng lúc đi chứ không phải ở A-pose.
        const walk = findClip(model.clips, spec.clips.walk)
        const run = findClip(model.clips, spec.clips.run)
        const inst = instantiateModel(model, spec.height, spec.yaw, true, walk ?? findClip(model.clips, spec.clips.idle))
        for (const anim of Object.keys(spec.clips) as PetAnim[]) this.clips[anim] = findClip(inst.clips, spec.clips[anim])

        // Tốc độ tự nhiên = sải chân (đã nhân tỉ lệ) / thời lượng clip.
        for (const clip of new Set([walk, run])) {
          if (!clip) continue
          const natural = (sampleClip(model, clip).stride * inst.scale) / clip.duration
          if (natural > 0.05) this.gaits.push({ clip, natural })
        }
        if (import.meta.dev) {
          const info = this.gaits.map((g) => `${g.clip.name.split('_').pop()} ${g.natural.toFixed(2)}`).join(', ')
          console.info(`[pet] ${def.id}: speed ${def.speed} · clip tự nhiên ${info || '(không đo được)'}`)
        }
        this.swapTo(inst)
      })
      .catch((err) => console.warn(`[pet] không tải được model ${spec.url}, giữ rig ghép khối`, err))
  }

  private swapTo(inst: ModelInstance): void {
    if (this.rig) this.root.remove(this.rig.root)
    this.rig = null
    this.model = inst
    this.root.add(inst.root)
    if (this.tone) setOutlineHighlight(this.root, this.tone)
  }

  /**
   * `speed` là tốc độ thật đang đi (0 khi đứng), để clip di chuyển chạy đúng
   * nhịp với quãng đường. `phase`/`t` chỉ rig ghép khối dùng.
   */
  update(anim: PetAnim, dt: number, phase: number, t: number, speed = 0): void {
    if (this.model) {
      this.play(anim, speed)
      this.model.mixer.update(dt / 1000)
      return
    }
    const rig = this.rig!
    const moving = anim === 'walk' || anim === 'run' ? 1 : 0
    animateWalk(rig, phase, moving, t)
    // Nhấp nhô nhẹ khi đang làm việc để thấy rõ pet đang "bận".
    if (anim === 'work') {
      rig.bob.position.y = Math.abs(Math.sin(t * 9)) * 0.09
      rig.bob.rotation.x = Math.sin(t * 9) * 0.2
    } else {
      rig.bob.rotation.x = 0
    }
  }

  /**
   * Chọn clip và nhịp. Đang di chuyển thì không tin `walk`/`run` từ AI mà
   * chọn theo tốc độ thật: clip nào có tốc độ tự nhiên gần nhất, rồi kéo
   * `timeScale` cho khớp hẳn — chân bám đất thay vì trượt. Trạng thái không có
   * clip thì rơi về idle.
   */
  private play(anim: PetAnim, speed: number): void {
    if (!this.model) return
    let clip: THREE.AnimationClip | null = null
    let timeScale = 1
    if ((anim === 'walk' || anim === 'run') && speed > 0) {
      const gait = this.pickGait(speed)
      if (gait) {
        clip = gait.clip
        timeScale = THREE.MathUtils.clamp(speed / gait.natural, 0.5, 2.2)
      }
    }
    clip ??= this.clips[anim] ?? this.clips.idle ?? this.model.clips[0] ?? null
    if (!clip) return

    const next = this.model.mixer.clipAction(clip)
    next.timeScale = timeScale
    if (next === this.action) return
    next.reset().fadeIn(0.2).play()
    this.action?.fadeOut(0.2)
    this.action = next
  }

  /** Clip có tốc độ tự nhiên gần `speed` nhất theo tỉ lệ (0.5 ô/s so với 1 và 4 thì gần 1 hơn). */
  private pickGait(speed: number): Gait | null {
    let best: Gait | null = null
    let bestErr = Infinity
    for (const g of this.gaits) {
      const err = Math.abs(Math.log(speed / g.natural))
      if (err < bestErr) {
        bestErr = err
        best = g
      }
    }
    return best
  }

  setHighlight(tone: HighlightTone | null): void {
    this.tone = tone
    setOutlineHighlight(this.root, tone)
  }

  dispose(): void {
    this.disposed = true
    if (this.model) {
      this.model.mixer.stopAllAction()
      this.model.mixer.uncacheRoot(this.model.mixer.getRoot() as THREE.Object3D)
    }
  }
}
