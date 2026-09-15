import type { GroundKind, Tile, Vec2 } from '../types'
import { mulberry32, valueNoise2D } from '../core/rng'

export const TILE = 1

/**
 * Lưới tile của thế giới. Đây là "nguồn sự thật" duy nhất về địa hình —
 * renderer chỉ đọc từ đây, không bao giờ tự giữ trạng thái riêng.
 */
export class Grid {
  readonly width: number
  readonly height: number
  readonly tiles: Tile[]

  /** Các ô thay đổi kể từ lần render trước; renderer đọc xong sẽ xoá. */
  readonly dirty = new Set<number>()

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.tiles = new Array(width * height)
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        this.tiles[z * width + x] = {
          x,
          z,
          ground: 'grass',
          tilled: false,
          wetUntil: 0,
          prop: null,
          propHp: 0,
          crop: null,
        }
      }
    }
  }

  index(x: number, z: number): number {
    return z * this.width + x
  }

  inBounds(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.width && z < this.height
  }

  at(x: number, z: number): Tile | null {
    if (!this.inBounds(x, z)) return null
    return this.tiles[this.index(x, z)]!
  }

  /** Tile chứa một điểm toạ độ thế giới. */
  atWorld(wx: number, wz: number): Tile | null {
    return this.at(Math.round(wx), Math.round(wz))
  }

  markDirty(x: number, z: number): void {
    if (this.inBounds(x, z)) this.dirty.add(this.index(x, z))
  }

  /** Người chơi và pet có đi qua được ô này không. */
  isWalkable(x: number, z: number): boolean {
    const t = this.at(x, z)
    if (!t) return false
    if (t.ground === 'water') return false
    if (t.prop === 'tree' || t.prop === 'rock') return false
    return true
  }

  /** Tâm ô trong toạ độ thế giới. */
  static center(x: number, z: number): Vec2 {
    return { x, z }
  }

  /** Duyệt các ô trong bán kính (theo ô vuông) quanh một điểm. */
  *around(cx: number, cz: number, radius: number): Generator<Tile> {
    const x0 = Math.max(0, Math.floor(cx - radius))
    const x1 = Math.min(this.width - 1, Math.ceil(cx + radius))
    const z0 = Math.max(0, Math.floor(cz - radius))
    const z1 = Math.min(this.height - 1, Math.ceil(cz + radius))
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        yield this.tiles[this.index(x, z)]!
      }
    }
  }
}

export interface WorldGenOptions {
  width: number
  height: number
  seed: number
  /** Kích thước khu đất trồng đã dọn sẵn ở giữa bản đồ. */
  farmSize: number
}

export const DEFAULT_GEN: WorldGenOptions = {
  width: 48,
  height: 48,
  seed: 1337,
  farmSize: 14,
}

/**
 * Sinh bản đồ: ao nước ở góc, rừng cây thưa quanh rìa, khu đất trồng dọn sẵn
 * ở giữa để người chơi bắt đầu ngay mà không phải chặt cây 10 phút.
 */
export function generateWorld(opts: WorldGenOptions = DEFAULT_GEN): Grid {
  const grid = new Grid(opts.width, opts.height)
  const rand = mulberry32(opts.seed)
  const noise = valueNoise2D(opts.seed)

  const cx = opts.width / 2
  const cz = opts.height / 2
  const half = opts.farmSize / 2

  // Ao nước: một hình tròn méo ở phía tây-bắc khu farm.
  const pond = { x: cx - opts.farmSize * 0.95, z: cz - opts.farmSize * 0.55, r: 4.2 }

  for (const tile of grid.tiles) {
    const { x, z } = tile
    const inFarm = Math.abs(x - cx) < half && Math.abs(z - cz) < half

    const pondD = Math.hypot(x - pond.x, z - pond.z) + noise(x * 0.35, z * 0.35) * 1.8 - 0.9
    if (pondD < pond.r) {
      tile.ground = 'water'
      continue
    }

    if (inFarm) {
      tile.ground = 'soil'
      continue
    }

    // Viền bản đồ là rừng dày, chặn người chơi đi ra ngoài.
    const edge = Math.min(x, z, opts.width - 1 - x, opts.height - 1 - z)
    if (edge <= 1) {
      tile.prop = 'tree'
      tile.propHp = 999
      continue
    }

    const density = noise(x * 0.12, z * 0.12)
    const jitter = rand()
    if (edge <= 4 || density > 0.68) {
      if (jitter < 0.55) {
        tile.prop = 'tree'
        tile.propHp = 3
      } else if (jitter < 0.75) {
        tile.prop = 'bush'
        tile.propHp = 1
      }
    } else if (density < 0.3 && jitter < 0.06) {
      tile.prop = 'rock'
      tile.propHp = 2
    } else if (jitter < 0.03) {
      tile.prop = 'bush'
      tile.propHp = 1
    }
  }

  // Lối mòn nối khu farm ra ao, cho đỡ lạc.
  const pathZ = Math.round(cz)
  for (let x = Math.round(pond.x); x < cx - half; x++) {
    const t = grid.at(x, pathZ)
    if (t && t.ground !== 'water') {
      t.ground = 'path'
      t.prop = null
    }
  }

  return grid
}

/** Dọn sạch prop quanh điểm spawn để người chơi không bị kẹt trong bụi cây. */
export function clearSpawnArea(grid: Grid, x: number, z: number, radius = 2): void {
  for (const tile of grid.around(x, z, radius)) {
    if (tile.ground === 'water') tile.ground = 'soil'
    tile.prop = null
    tile.propHp = 0
  }
}

export function groundIsFarmable(ground: GroundKind): boolean {
  return ground === 'soil' || ground === 'grass'
}
