import * as THREE from 'three'
import { valueNoise2D } from '../core/rng'

/**
 * Một gradient 3 bậc làm rampa cho MeshToonMaterial — đây là thứ tạo ra mảng
 * sáng/tối phẳng đặc trưng của Zelda thay vì đổ bóng mượt kiểu PBR.
 */
function makeToonRamp(steps = 2): THREE.DataTexture {
  // Hai bậc, không phải ba: bề mặt được chiếu sáng thành MỘT mảng màu phẳng
  // duy nhất, còn vùng khuất là một mảng thứ hai rõ rệt. Đây là điều tạo ra
  // cảm giác "tô màu phẳng rồi vẽ bóng đè lên" của tranh vẽ tay, thay vì độ
  // chuyển sáng liên tục của đồ hoạ 3D thông thường.
  const LEVELS = [0.62, 1.0]
  const data = new Uint8Array(steps * 4)
  for (let i = 0; i < steps; i++) {
    const v = Math.round(255 * (LEVELS[Math.min(i, LEVELS.length - 1)] ?? 1))
    data.set([v, v, v, 255], i * 4)
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

export const PALETTE = {
  // Bảng màu pastel, độ bão hoà thấp. Tranh màu nước không dùng màu nguyên
  // chất; mọi thứ đều ngả về xám một chút, và độ tương phản giữa các vật nằm ở
  // nét mực chứ không ở màu.
  grassLight: 0xb2c880,
  grassDark: 0x9cb46c,
  soil: 0xa9835a,
  soilTilled: 0x9c7850,
  soilWet: 0x7e5f3f,
  soilTilledWet: 0x74563a,
  water: 0x8fc6d8,
  waterDeep: 0x6fadc4,
  /** Đáy ao nhìn xuyên qua mặt nước trong suốt. */
  waterBed: 0x86976a,
  path: 0xc9b58f,
  /** Tường và mái nhà chính. */
  wall: 0xf1e6cf,
  roof: 0xc76f5b,
  /** Bãi cát viền đảo và bờ ao: nhạt hơn lối mòn để dải bờ nổi lên từ xa. */
  sand: 0xe3d3a6,
  trunk: 0x9a7350,
  foliage: 0x8fb968,
  foliageDark: 0x7aa456,
  rock: 0xbab5a9,
  rockDark: 0xa19c92,
  bush: 0x88b262,
  skin: 0xf6ddc0,
  shirt: 0xf4efe2,
  pants: 0xc9a87e,
  hair: 0xa1764e,
  hat: 0x3f5d87,
} as const

let ramp: THREE.DataTexture | null = null

function toonRamp(): THREE.DataTexture {
  if (!ramp) ramp = makeToonRamp(2)
  return ramp
}

const cache = new Map<string, THREE.Material>()

/**
 * Vật liệu toon một màu, cache theo màu để không tạo trùng.
 *
 * MeshToonMaterial không có `flatShading`; ta không cần nó vì các khối low-poly
 * ở đây (Box, Icosahedron detail=0, Cone ít cạnh) vốn đã sinh normal phẳng.
 */
export function toon(color: number): THREE.MeshToonMaterial {
  const key = `toon:${color}`
  const hit = cache.get(key)
  if (hit) return hit as THREE.MeshToonMaterial
  const mat = new THREE.MeshToonMaterial({ color, gradientMap: toonRamp() })
  cache.set(key, mat)
  return mat
}

/** Vật liệu dùng cho geometry đã nướng màu vào vertex (địa hình, prop, cây). */
export function toonVertexColors(): THREE.MeshToonMaterial {
  const key = 'toon:vc'
  const hit = cache.get(key)
  if (hit) return hit as THREE.MeshToonMaterial
  const mat = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: toonRamp(),
  })
  cache.set(key, mat)
  return mat
}

/**
 * Toon có texture, cho model ngoài giữ nguyên texture (pet có rig — không nướng
 * được vertex color vì geometry biến dạng theo xương). Cache theo texture.
 */
export function toonTextured(
  map: THREE.Texture,
  color = 0xffffff,
  emissiveMap: THREE.Texture | null = null,
): THREE.MeshToonMaterial {
  const key = `toon:map:${map.uuid}:${color}:${emissiveMap?.uuid ?? ''}`
  const hit = cache.get(key)
  if (hit) return hit as THREE.MeshToonMaterial
  // Mắt/hoa văn phát sáng của một số model nằm ở emissive; bỏ đi thì thành mảng đen.
  const mat = new THREE.MeshToonMaterial({ map, color, gradientMap: toonRamp() })
  if (emissiveMap) {
    mat.emissiveMap = emissiveMap
    mat.emissive.setHex(0xffffff)
  }
  cache.set(key, mat)
  return mat
}

/** Bóng đổ giả dưới chân nhân vật — rẻ hơn nhiều so với shadow map cho vật nhỏ. */
export function blobShadowMaterial(): THREE.MeshBasicMaterial {
  const key = 'blob'
  const hit = cache.get(key)
  if (hit) return hit as THREE.MeshBasicMaterial

  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(0,0,0,0.42)')
  g.addColorStop(0.6, 'rgba(0,0,0,0.18)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  const tex = new THREE.CanvasTexture(canvas)
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })
  cache.set(key, mat)
  return mat
}

export function disposeMaterials(): void {
  for (const mat of cache.values()) mat.dispose()
  cache.clear()
  ramp?.dispose()
  ramp = null
}

const groundNoise = valueNoise2D(0x5eed)
const mixA = new THREE.Color()
const mixB = new THREE.Color()

/**
 * Màu nền của một ô, pha theo nhiễu liên tục thay vì hash từng ô. Hash cho ra
 * bàn cờ nhấp nháy rất lộ; nhiễu cho những mảng màu loang tự nhiên.
 */
function blendByNoise(x: number, z: number, light: number, dark: number, scale = 0.18): number {
  // Hai tần số chồng nhau: mảng lớn cho địa hình, nhiễu nhỏ phá vỡ đường viền.
  const broad = groundNoise(x * scale, z * scale)
  const fine = groundNoise(x * 0.9 + 40, z * 0.9 + 40)
  // Giữ biên độ hẹp: nhiễu mạnh quá thì đồng cỏ trông như bị vá chằng chịt.
  const t = Math.min(1, Math.max(0, broad * 0.85 + fine * 0.15))
  mixA.setHex(dark)
  mixB.setHex(light)
  return mixA.lerp(mixB, t).getHex()
}

export function grassColorAt(x: number, z: number): number {
  return blendByNoise(x, z, PALETTE.grassLight, PALETTE.grassDark)
}

/** Đất trồng cũng cần vân, nếu không khu farm trông như một mảng nâu chết. */
export function soilColorAt(x: number, z: number, base: number): number {
  const c = new THREE.Color(base)
  const n = groundNoise(x * 0.55 + 11, z * 0.55 + 11)
  c.offsetHSL(0, 0, (n - 0.5) * 0.055)
  return c.getHex()
}
