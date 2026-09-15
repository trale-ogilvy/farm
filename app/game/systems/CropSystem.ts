import type { Grid } from '../world/Grid'
import { cropDef, cropGrowMs, cropStage } from '../data/crops'
import { DAY_LENGTH_MS } from '../core/Time'

/** Đất giữ ẩm nửa ngày game sau khi tưới. */
export const WET_DURATION = DAY_LENGTH_MS * 0.5

/** Cây khô vẫn lớn, nhưng chậm hẳn — phạt chứ không giết, cho đỡ ức chế. */
const DRY_RATE = 0.3

const TICK_MS = 250

/**
 * Đẩy tiến độ sinh trưởng. Chạy theo tick 250ms chứ không mỗi frame: quét toàn
 * lưới 4 lần/giây là đủ mượt và rẻ hơn nhiều so với việc giữ index riêng luôn
 * phải đồng bộ với save/load.
 */
export class CropSystem {
  private acc = 0

  update(dt: number, grid: Grid, now: number): boolean {
    this.acc += dt
    if (this.acc < TICK_MS) return false
    const step = this.acc
    this.acc = 0

    let changed = false

    for (const tile of grid.tiles) {
      const wasWet = tile.wetUntil > now - step
      const isWet = tile.wetUntil > now
      if (wasWet && !isWet) changed = true // đất vừa khô -> đổi màu

      if (!tile.crop) continue
      const def = cropDef(tile.crop.typeId)
      const total = cropGrowMs(def)
      if (tile.crop.growth >= total) continue

      tile.crop.growth = Math.min(total, tile.crop.growth + step * (isWet ? 1 : DRY_RATE))
      const stage = cropStage(def, tile.crop.growth)
      if (stage !== tile.crop.stage) {
        tile.crop.stage = stage
        changed = true
      }
    }

    return changed
  }

  /**
   * Bù tiến độ cho khoảng thời gian người chơi offline. Không lưu lịch sử tưới
   * nên áp mức khô cho toàn bộ khoảng nghỉ — thiệt cho người chơi một chút,
   * nhưng không bao giờ cho không thứ họ chưa làm.
   */
  applyOfflineProgress(grid: Grid, offlineMs: number, now: number): void {
    if (offlineMs <= 0) return
    for (const tile of grid.tiles) {
      if (!tile.crop) continue
      const def = cropDef(tile.crop.typeId)
      const total = cropGrowMs(def)
      const wetMs = Math.max(0, Math.min(offlineMs, tile.wetUntil - (now - offlineMs)))
      const dryMs = offlineMs - wetMs
      tile.crop.growth = Math.min(total, tile.crop.growth + wetMs + dryMs * DRY_RATE)
      tile.crop.stage = cropStage(def, tile.crop.growth)
    }
  }
}
