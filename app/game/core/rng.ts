/**
 * PRNG có seed (mulberry32). Dùng seed cố định để bản đồ sinh ra giống nhau
 * mỗi lần load cùng một save, và để sau này server có thể tái tạo cùng thế giới.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Nhiễu value-noise 2D đơn giản, đủ dùng để rải cỏ/cây cho tự nhiên. */
export function valueNoise2D(seed: number) {
  const rand = mulberry32(seed)
  const perm = new Uint8Array(512)
  for (let i = 0; i < 256; i++) perm[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[perm[i], perm[j]] = [perm[j]!, perm[i]!]
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i]!

  const fade = (t: number) => t * t * (3 - 2 * t)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const grad = (hash: number) => (hash & 255) / 255

  return (x: number, y: number): number => {
    const xi = Math.floor(x) & 255
    const yi = Math.floor(y) & 255
    const xf = x - Math.floor(x)
    const yf = y - Math.floor(y)
    const u = fade(xf)
    const v = fade(yf)
    const aa = grad(perm[perm[xi]! + yi]!)
    const ab = grad(perm[perm[xi]! + yi + 1]!)
    const ba = grad(perm[perm[xi + 1]! + yi]!)
    const bb = grad(perm[perm[xi + 1]! + yi + 1]!)
    return lerp(lerp(aa, ba, u), lerp(ab, bb, u), v)
  }
}
