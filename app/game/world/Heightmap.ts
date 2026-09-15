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
  /** Nửa cạnh của cao nguyên phẳng dành cho khu trồng trọt. */
  farmHalf: number
  pond: { x: number; z: number; r: number }
}

/**
 * Sinh địa hình đồi thoải.
 *
 * Ba ràng buộc chi phối thiết kế này:
 *  1. Khu trồng trọt phải PHẲNG TUYỆT ĐỐI — luống cày trên dốc trông sai và
 *     việc canh ô sẽ khó chịu.
 *  2. Đồi phải thoải, vì pet chỉ biết đi thẳng và né một bước; dốc đứng giữa
 *     bản đồ sẽ làm chúng kẹt.
 *  3. Rìa bản đồ phải cao lên thành vách, vừa chặn người chơi đi ra ngoài vừa
 *     tạo hậu cảnh cho camera BotW nhìn xa.
 */
export function generateHeights(opts: HeightGenOptions): Heightmap {
  const map = new Heightmap(opts.width, opts.height)
  const n1 = valueNoise2D(opts.seed)
  const n2 = valueNoise2D(opts.seed ^ 0x9e37)
  const n3 = valueNoise2D(opts.seed ^ 0x51ed)

  const cx = opts.width / 2
  const cz = opts.height / 2

  for (let j = 0; j < map.rows; j++) {
    for (let i = 0; i < map.cols; i++) {
      const wx = i - 0.5
      const wz = j - 0.5

      // Ba tần số chồng nhau: đồi lớn, gò nhỏ, và gợn mặt đất.
      let h =
        (n1(wx * 0.045, wz * 0.045) - 0.5) * 3.0 +
        (n2(wx * 0.11, wz * 0.11) - 0.5) * 0.95 +
        (n3(wx * 0.31, wz * 0.31) - 0.5) * 0.25

      // Vách bao quanh bản đồ. Dùng luỹ thừa bậc 3 chứ không phải smoothstep:
      // phần trong thoải tới mức đi được, phần ngoài dựng đứng vượt ngưỡng dốc
      // nên tự thành rào chắn. Đỉnh vách cố ý thấp — vách cao che sạch bầu trời
      // và làm mất cảm giác thế giới mở.
      const edge = Math.min(wx, wz, opts.width - wx, opts.height - wz)
      if (edge < 12) {
        const t = 1 - Math.max(0, edge) / 12
        h += Math.pow(t, 3) * 11
      }

      // Lòng ao: khoét xuống dưới mực nước.
      const pd = Math.hypot(wx - opts.pond.x, wz - opts.pond.z)
      if (pd < opts.pond.r + 3) {
        const t = 1 - smoothstep(opts.pond.r - 1, opts.pond.r + 3, pd)
        h = lerp(h, WATER_LEVEL - 1.5, t)
      }

      // Cao nguyên nông trại: ép phẳng về 0, chuyển tiếp mượt ra ngoài 6 ô.
      const fd = Math.max(Math.abs(wx - cx), Math.abs(wz - cz))
      if (fd < opts.farmHalf + 6) {
        const t = 1 - smoothstep(opts.farmHalf, opts.farmHalf + 6, fd)
        h = lerp(h, 0, t)
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
