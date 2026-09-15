import type { BuildingKind } from '../types'

/**
 * Cầu nối duy nhất giữa engine (chạy 60fps, dữ liệu thuần) và UI Vue (reactive).
 * Engine không bao giờ import Vue; nó chỉ emit event, UI lắng nghe và tự cập nhật.
 */
export interface GameEvents {
  toast: { text: string; kind?: 'info' | 'good' | 'bad' }
  'player:changed': void
  'pets:changed': void
  'time:changed': { time: number; day: number; hour: number }
  'tile:changed': { x: number; z: number }
  'catch:result': { petName: string; success: boolean }
  'save:state': 'saving' | 'saved' | 'error'
  'ui:open': 'none' | 'pets' | 'shop' | 'pokedex' | 'backpack' | 'build'
  /** Đổi loại công trình đang đặt (null = thôi đặt). */
  'build:changed': BuildingKind | null
  /** Mở / đóng túi hạt — mở khi bấm vào luống trống, đóng khi chọn xong. */
  'ui:seedPicker': boolean
  /** Hỏi người chơi có chắc dỡ công trình ở ô này không. */
  'ui:confirmRemove': { x: number; z: number; kind: BuildingKind; hasCrop: boolean }
  /** Esc: lớp UI tự quyết đóng cái gì trước (bảng nhỏ trước bảng lớn). */
  'ui:escape': void
}

type Handler<K extends keyof GameEvents> = (payload: GameEvents[K]) => void

export class EventBus {
  private handlers = new Map<string, Set<(p: unknown) => void>>()

  on<K extends keyof GameEvents>(event: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(fn as (p: unknown) => void)
    return () => set!.delete(fn as (p: unknown) => void)
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(event)
    if (!set) return
    for (const fn of set) {
      try {
        fn(payload)
      } catch (err) {
        console.error(`[EventBus] handler lỗi ở "${event}"`, err)
      }
    }
  }

  clear(): void {
    this.handlers.clear()
  }
}
