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
  'ui:open': 'none' | 'pets' | 'shop' | 'pokedex' | 'backpack'
  /** Mở bảng chọn hạt — chỉ bắn khi người chơi thực sự định gieo xuống luống. */
  'ui:seedPicker': void
  /** Esc: lớp UI tự quyết đóng cái gì trước (bảng chọn hạt trước ba lô). */
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
