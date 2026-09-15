import type { EventBus } from './EventBus'

/** Một ngày trong game kéo dài bao nhiêu mili-giây thực tế. */
export const DAY_LENGTH_MS = 12 * 60_000
const HOURS_PER_DAY = 24
/** Mỗi ngày bắt đầu lúc 7h sáng, ngay sau bình minh. */
const DAY_START_HOUR = 7

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Đồng hồ thế giới. Giữ tổng thời gian đã trôi (ms) — mọi thứ khác (ngày, giờ,
 * góc mặt trời) đều suy ra từ con số này, nên save/load chỉ cần lưu một số.
 */
export class GameClock {
  /** Tổng ms game đã trôi từ lúc bắt đầu file save. */
  elapsed = 0

  private lastEmittedHour = -1

  constructor(private bus: EventBus) {}

  update(dt: number): void {
    this.elapsed += dt
    const hour = this.hour
    if (Math.floor(hour) !== this.lastEmittedHour) {
      this.lastEmittedHour = Math.floor(hour)
      this.bus.emit('time:changed', { time: this.elapsed, day: this.day, hour })
    }
  }

  /** Ngày thứ mấy, bắt đầu từ 1. */
  get day(): number {
    return Math.floor(this.elapsed / DAY_LENGTH_MS) + 1
  }

  /** Giờ trong ngày dạng số thực 0..24. Ngày bắt đầu lúc 7h sáng. */
  get hour(): number {
    const dayProgress = (this.elapsed % DAY_LENGTH_MS) / DAY_LENGTH_MS
    return (dayProgress * HOURS_PER_DAY + DAY_START_HOUR) % HOURS_PER_DAY
  }

  get isNight(): boolean {
    const h = this.hour
    return h < 5 || h >= 19.5
  }

  /**
   * 0 = đêm, 1 = ban ngày. Không dùng sin() vì như vậy lúc 7h sáng (đầu ngày)
   * sẽ tối đen; thay bằng hai đoạn chuyển mượt ở bình minh và hoàng hôn để
   * phần lớn ngày chơi luôn sáng rõ.
   */
  get daylight(): number {
    const h = this.hour
    return Math.min(smoothstep(5, 7, h), 1 - smoothstep(18, 20.5, h))
  }

  formatClock(): string {
    const h = Math.floor(this.hour)
    const m = Math.floor((this.hour - h) * 60)
    return `${String(h).padStart(2, '0')}:${String(Math.floor(m / 10) * 10).padStart(2, '0')}`
  }
}
