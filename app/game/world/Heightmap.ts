import { valueNoise2D } from '../core/rng'

/** Mực nước của ao/hồ. Địa hình thấp hơn mức này thì chìm. */
export const WATER_LEVEL = -0.85

/** Chênh lệch độ cao tối đa trong một ô mà vẫn đi qua được; cao hơn là vách. */
export const MAX_WALKABLE_STEP = 0.85

/**
 * Lưới độ cao lưu theo GÓC ô chứ không theo tâm ô.
 *
 * Lý do: hai ô kề nhau dùng chung hai góc, nên mặt đất nối liền không kẽ hở.
 * Nếu lưu theo tâm ô rồi suy ra góc, mỗi ô sẽ tự tính ra một độ cao góc hơi
 * khác nhau và địa hình sẽ nứt thành từng mảnh.
 */
export class Heightmap {
  readonly cols: number
  readonly rows: number
  readonly corners: Float32Array

  constructor(width: number, height: number) {
    this.cols = width + 1
    this.rows = height + 1
    this.corners = new Float32Array(this.cols * this.rows)
  }

  /** Góc (i, j) nằm ở toạ độ thế giới (i - 0.5, j - 0.5). */
  corner(i: number, j: number): number {
    const ci = Math.min(this.cols - 1, Math.max(0, i))
    const cj = Math.min(this.rows - 1, Math.max(0, j))
    return this.corners[cj * this.cols + ci]!
  }

  setCorner(i: number, j: number, v: number): void {
    this.corners[j * this.cols + i] = v
  }

  /** Độ cao tại một điểm bất kỳ, nội suy song tuyến từ 4 góc bao quanh. */
  sample(wx: number, wz: number): number {
    const fi = wx + 0.5
    const fj = wz + 0.5
    const i0 = Math.floor(fi)
    const j0 = Math.floor(fj)
    const tx = fi - i0
    const tz = fj - j0

    const h00 = this.corner(i0, j0)
    const h10 = this.corner(i0 + 1, j0)
    const h01 = this.corner(i0, j0 + 1)
    const h11 = this.corner(i0 + 1, j0 + 1)

    return (
      h00 * (1 - tx) * (1 - tz) +
      h10 * tx * (1 - tz) +
      h01 * (1 - tx) * tz +
      h11 * tx * tz
    )
  }

  /** Độ cao đại diện của một ô: trung bình 4 góc. */
  tileHeight(x: number, z: number): number {
    return (
      (this.corner(x, z) +
        this.corner(x + 1, z) +
        this.corner(x, z + 1) +
        this.corner(x + 1, z + 1)) *
      0.25
    )
  }

  /** Độ dốc của một ô, đo bằng chênh lệch lớn nhất giữa 4 góc. */
  tileSlope(x: number, z: number): number {
    const a = this.corner(x, z)
    const b = this.corner(x + 1, z)
    const c = this.corner(x, z + 1)
    const d = this.corner(x + 1, z + 1)
    return Math.max(a, b, c, d) - Math.min(a, b, c, d)
  }
}

export interface HeightGenOptions {
  width: number
  height: number
  seed: number
  /** Bán kính đảo tính từ tâm bản đồ, chưa kể mép nhấp nhô. */
  islandRadius: number
  pond: { x: number; z: number; r: number }
}

/** Đáy biển quanh đảo. Cũng là cao độ của mặt phẳng đáy kéo ra tới chân trời. */
export const SEABED = WATER_LEVEL - 1.2

/** Bờ biển trải trên bao nhiêu ô, từ mép đảo xuống tới đáy. */
const SHORE_WIDTH = 6

/**
 * Sinh địa hình đảo tròn, mặt đảo PHẲNG hoàn toàn ở cao độ 0.
 *
 * Phẳng tuyệt đối vì luống cày trên dốc trông sai, và pet chỉ biết đi thẳng
 * nên không có gì để chúng kẹt. Rào chắn bản đồ không còn là vách đá mà là
 * biển: bờ thoải xuống đáy, ô nào chìm dưới mực nước thì không đi được, nên
 * người chơi tự dừng ở mép nước mà không cần tường vô hình.
 *
 * Bờ được trải trên SHORE_WIDTH ô để độ dốc mỗi ô luôn dưới MAX_WALKABLE_STEP,
 * nhờ vậy đi được xuống tận mép nước để múc.
 */
export function generateHeights(opts: HeightGenOptions): Heightmap {
  const map = new Heightmap(opts.width, opts.height)
  const coast = valueNoise2D(opts.seed ^ 0x9e37)

  const cx = opts.width / 2
  const cz = opts.height / 2

  for (let j = 0; j < map.rows; j++) {
    for (let i = 0; i < map.cols; i++) {
      const wx = i - 0.5
      const wz = j - 0.5

      // Mép đảo nhấp nhô nhẹ theo góc phương vị: vẫn đọc ra là hình tròn,
      // nhưng không phải cái đĩa compa. Lấy mẫu nhiễu trên vòng tròn đơn vị
      // nên đường bờ tự khép kín, không có mối nối.
      const dist = Math.hypot(wx - cx, wz - cz)
      const angle = Math.atan2(wz - cz, wx - cx)
      const wobble = (coast(Math.cos(angle) * 2.2 + 7, Math.sin(angle) * 2.2 + 7) - 0.5) * 3
      const shore = dist - (opts.islandRadius + wobble)

      let h = lerp(0, SEABED, smoothstep(0, SHORE_WIDTH, shore))

      // Lòng ao: khoét xuống cùng độ sâu với biển. Bờ ao cũng trải rộng như
      // bờ biển để đi được xuống sát mép nước mà múc.
      const pd = Math.hypot(wx - opts.pond.x, wz - opts.pond.z)
      if (pd < opts.pond.r + SHORE_WIDTH) {
        const t = smoothstep(opts.pond.r - 1, opts.pond.r + SHORE_WIDTH - 1, pd)
        h = Math.min(h, lerp(SEABED, 0, t))
      }

      map.setCorner(i, j, h)
    }
  }

  return map
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
