import type { BuildingKind, GroundKind, Tile, Vec2 } from '../types'
import { BUILDINGS } from '../data/buildings'
import { mulberry32, valueNoise2D } from '../core/rng'
import {
  Heightmap,
  MAX_WALKABLE_STEP,
  WATER_LEVEL,
  generateHeights,
} from './Heightmap'

export const TILE = 1

/**
 * Lưới tile của thế giới. Đây là "nguồn sự thật" duy nhất về địa hình —
 * renderer chỉ đọc từ đây, không bao giờ tự giữ trạng thái riêng.
 */
export class Grid {
  readonly width: number
  readonly height: number
  readonly tiles: Tile[]
  /** Độ cao lưu theo góc ô; gán ngay sau khi sinh thế giới. */
  heights: Heightmap
  /** Tâm nhà chính — điểm xuất phát và tâm của vùng được xây. */
  home: Vec2 = { x: 0, z: 0 }
  /** Bán kính vùng xây dựng quanh nhà, tính bằng ô. */
  buildRadius = 0

  /** Các ô thay đổi kể từ lần render trước; renderer đọc xong sẽ xoá. */
  readonly dirty = new Set<number>()

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.heights = new Heightmap(width, height)
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
          site: null,
          building: null,
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

  /** Độ cao mặt đất tại một điểm bất kỳ — dùng để đặt chân nhân vật và pet. */
  groundY(wx: number, wz: number): number {
    return this.heights.sample(wx, wz)
  }

  /**
   * Người chơi và pet có đi qua được ô này không.
   * Ngoài vật cản còn chặn cả dốc đứng — đảo hiện phẳng nên hiếm khi chạm,
   * nhưng giữ lại để địa hình sau này có đồi thì không leo được lên vách.
   */
  isWalkable(x: number, z: number): boolean {
    const t = this.at(x, z)
    if (!t) return false
    if (t.ground === 'water') return false
    if (t.prop === 'tree' || t.prop === 'rock' || t.prop === 'house') return false
    if (this.heights.tileSlope(x, z) > MAX_WALKABLE_STEP) return false
    return true
  }

  /** Ô có nằm trong vòng tròn được phép xây quanh nhà không. */
  inBuildZone(x: number, z: number): boolean {
    return Math.hypot(x - this.home.x, z - this.home.z) <= this.buildRadius
  }

  /**
   * Đặt được công trình xuống ô này không. Mọi loại công trình hiện cùng một
   * luật: trong vùng xây, đất trống, không có gì trên đó, chưa có công trình.
   */
  canBuildAt(x: number, z: number, _kind: BuildingKind): boolean {
    const t = this.at(x, z)
    if (!t) return false
    if (!this.inBuildZone(x, z)) return false
    if (t.ground !== 'grass' && t.ground !== 'soil') return false
    if (t.prop || t.crop || t.tilled || t.site || t.building) return false
    return true
  }

  /**
   * Ô này có công trình dỡ được không: bãi đang xây dở (đặt từ menu nên luôn
   * dỡ được) hoặc công trình đã xong mà loại của nó cho phép.
   */
  removableAt(x: number, z: number): BuildingKind | null {
    const t = this.at(x, z)
    if (!t) return null
    if (t.site) return t.site.kind
    if (t.building && BUILDINGS[t.building].removable) return t.building
    return null
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
  /** Bán kính đảo. Phải chừa đủ chỗ cho bờ biển trước khi chạm mép lưới. */
  islandRadius: number
  /** Bán kính vùng được xây quanh nhà chính. */
  buildRadius: number
}

export const DEFAULT_GEN: WorldGenOptions = {
  width: 80,
  height: 80,
  seed: 1337,
  farmSize: 16,
  islandRadius: 31,
  buildRadius: 12,
}

/** Nhà chính chiếm (2·HOUSE_HALF + 1)² ô quanh tâm bản đồ. */
const HOUSE_HALF = 1

/** Cao hơn mực nước nhưng thấp hơn mức này là bãi cát: dải bờ quanh đảo và ao. */
const SAND_LEVEL = -0.12

/**
 * Sinh bản đồ. Độ cao sinh trước, phần còn lại suy ra từ nó: chỗ nào thấp hơn
 * mực nước thì thành biển/ao, dải bờ ngay trên mực nước thành cát, còn lại là
 * đồng cỏ phẳng để mọc cây.
 */
export function generateWorld(opts: WorldGenOptions = DEFAULT_GEN): Grid {
  const grid = new Grid(opts.width, opts.height)
  const rand = mulberry32(opts.seed)
  const noise = valueNoise2D(opts.seed)

  const cx = opts.width / 2
  const cz = opts.height / 2
  const half = opts.farmSize / 2
  const pond = { x: cx - opts.farmSize * 1.15, z: cz - opts.farmSize * 0.6, r: 5.5 }

  grid.heights = generateHeights({
    width: opts.width,
    height: opts.height,
    seed: opts.seed,
    islandRadius: opts.islandRadius,
    pond,
  })

  for (const tile of grid.tiles) {
    const { x, z } = tile
    const h = grid.heights.tileHeight(x, z)
    const inFarm = Math.abs(x - cx) < half && Math.abs(z - cz) < half

    if (h < WATER_LEVEL) {
      tile.ground = 'water'
      continue
    }

    // Bãi cát: để trống, không cây không đá. Dải sáng viền quanh đảo là thứ
    // làm nó đọc ra là ĐẢO ngay từ góc nhìn thấp của camera sau lưng.
    if (h < SAND_LEVEL) {
      tile.ground = 'sand'
      continue
    }

    // Cao nguyên nông trại để nguyên là ĐỒNG CỎ, không phải đất trọc sẵn.
    // Một mảng nâu 16×16 chiếm hết khung hình và trông như lỗi render; để cỏ
    // thì cảnh đẹp hơn hẳn, và luống cày người chơi tự tạo mới nổi bật lên.
    if (inFarm) continue

    const density = noise(x * 0.09, z * 0.09)
    const jitter = rand()
    const fromCentre = Math.max(Math.abs(x - cx), Math.abs(z - cz))

    // Cao nguyên trồng trọt phải trống tuyệt đối.
    if (fromCentre < half + 1) continue

    // Vành đai quanh nông trại: rải bụi và đá nhỏ cho đỡ trống, nhưng không có
    // cây to — cây to ở gần sẽ che mất tầm nhìn của camera sau lưng.
    if (fromCentre < half + 6) {
      if (jitter < 0.035) {
        tile.prop = 'bush'
        tile.propHp = 1
      } else if (jitter < 0.045) {
        tile.prop = 'rock'
        tile.propHp = 2
      }
      continue
    }

    if (density > 0.62) {
      if (jitter < 0.5) {
        tile.prop = 'tree'
        tile.propHp = 3
      } else if (jitter < 0.72) {
        tile.prop = 'bush'
        tile.propHp = 1
      }
    } else if (density < 0.32 && jitter < 0.02) {
      tile.prop = 'rock'
      tile.propHp = 2
    } else if (jitter < 0.012) {
      tile.prop = 'bush'
      tile.propHp = 1
    }
  }

  // Nhà chính ở đúng tâm. Các ô dưới nhà mang prop 'house' với máu 999 —
  // cùng quy ước với "không chặt được" — nên mọi hệ thống đã biết bỏ qua nó
  // mà không cần thêm nhánh riêng; renderer thì vẽ nhà bằng MỘT mesh ở `home`.
  grid.home = { x: Math.round(cx), z: Math.round(cz) }
  grid.buildRadius = opts.buildRadius
  for (let z = -HOUSE_HALF; z <= HOUSE_HALF; z++) {
    for (let x = -HOUSE_HALF; x <= HOUSE_HALF; x++) {
      const t = grid.at(grid.home.x + x, grid.home.z + z)
      if (!t) continue
      t.prop = 'house'
      t.propHp = 999
    }
  }

  // Lối mòn từ nông trại ra ao, bám theo một đường thẳng và tránh nước.
  const pathZ = Math.round(cz)
  for (let x = Math.round(pond.x) + 2; x < cx - half; x++) {
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

export { WATER_LEVEL, MAX_WALKABLE_STEP }
