import * as THREE from 'three'
import { valueNoise2D } from '../core/rng'

/**
 * Một gradient 3 bậc làm rampa cho MeshToonMaterial — đây là thứ tạo ra mảng
 * sáng/tối phẳng đặc trưng của Zelda thay vì đổ bóng mượt kiểu PBR.
 */
function makeToonRamp(steps = 3): THREE.DataTexture {
  const data = new Uint8Array(steps * 4)
  for (let i = 0; i < steps; i++) {
    // Bậc thấp nhất không xuống quá tối, giữ màu vẫn tươi trong bóng râm.
    const v = Math.round(255 * (0.45 + (0.55 * i) / (steps - 1)))
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
  grassLight: 0x7cba52,
  grassDark: 0x67a544,
  soil: 0x8f6637,
  soilTilled: 0x79512a,
  soilWet: 0x5c3b1d,
  soilTilledWet: 0x503219,
  /** Gờ luống cày sáng hơn mặt ô để bắt sáng và đọc ra khối nổi. */
  furrowRidge: 0x9a6c3c,
  furrowRidgeWet: 0x6f4725,
  water: 0x3f8fd0,
  waterDeep: 0x2f6ea8,
  path: 0xc2a878,
  trunk: 0x6b4a2c,
  foliage: 0x3f8a3a,
  foliageDark: 0x336f30,
  rock: 0x8d8f93,
  rockDark: 0x6f7176,
  bush: 0x4f9c46,
  skin: 0xf2c79b,
  shirt: 0x3d7fd6,
  pants: 0x35406b,
  hair: 0x4a2f1d,
  hat: 0xd8b352,
} as const

let ramp: THREE.DataTexture | null = null

function toonRamp(): THREE.DataTexture {
  if (!ramp) ramp = makeToonRamp(3)
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
