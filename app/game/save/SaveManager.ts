import type { WorldSnapshot } from '../types'
import { SAVE_VERSION } from '../core/Engine'
import { initFirebase, currentBundle, type FirebaseConfig } from './firebase'

/** Khoá localStorage. Export để lối lưu khẩn ở beforeunload dùng đúng khoá này. */
export const LOCAL_SAVE_KEY = 'farm:save:v4'

export type SaveBackend = 'firebase' | 'local'

/**
 * Lưu game hai tầng: localStorage luôn ghi (nhanh, offline được), Firestore ghi
 * thêm khi có cấu hình. Khi load thì bản nào mới hơn thắng — người chơi đổi máy
 * vẫn lấy được tiến độ, mà mất mạng cũng không mất bài.
 */
export class SaveManager {
  backend: SaveBackend = 'local'
  lastSavedAt = 0

  private saving = false
  private pending: WorldSnapshot | null = null

  constructor(private cfg: Partial<FirebaseConfig>) {}

  async init(): Promise<SaveBackend> {
    const fb = await initFirebase(this.cfg)
    this.backend = fb ? 'firebase' : 'local'
    return this.backend
  }

  async load(): Promise<WorldSnapshot | null> {
    const local = this.loadLocal()
    const remote = await this.loadRemote()

    if (local && remote) return remote.savedAt >= local.savedAt ? remote : local
    return remote ?? local
  }

  private loadLocal(): WorldSnapshot | null {
    try {
      const raw = localStorage.getItem(LOCAL_SAVE_KEY)
      if (!raw) return null
      const snap = JSON.parse(raw) as WorldSnapshot
      return snap.version === SAVE_VERSION ? snap : null
    } catch {
      return null
    }
  }

  private async loadRemote(): Promise<WorldSnapshot | null> {
    const fb = currentBundle()
    if (!fb) return null
    try {
      const { doc, getDoc } = await import('firebase/firestore')
      const ref = doc(fb.db, 'farms', fb.user.uid)
      const snap = await getDoc(ref)
      if (!snap.exists()) return null
      const data = snap.data() as WorldSnapshot
      return data.version === SAVE_VERSION ? data : null
    } catch (err) {
      console.warn('[save] đọc Firestore lỗi:', err)
      return null
    }
  }

  /**
   * Ghi save. Nếu đang ghi dở thì giữ lại bản mới nhất và ghi tiếp sau — tránh
   * xếp hàng hàng chục request khi người chơi thao tác liên tục.
   */
  async save(snapshot: WorldSnapshot): Promise<void> {
    if (this.saving) {
      this.pending = snapshot
      return
    }
    this.saving = true

    try {
      localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(snapshot))
    } catch (err) {
      console.warn('[save] localStorage đầy hoặc bị chặn:', err)
    }

    const fb = currentBundle()
    if (fb) {
      try {
        const { doc, setDoc } = await import('firebase/firestore')
        const payload = snapshot as unknown as Record<string, unknown>
        await setDoc(doc(fb.db, 'farms', fb.user.uid), payload)
      } catch (err) {
        console.warn('[save] ghi Firestore lỗi:', err)
      }
    }

    this.lastSavedAt = Date.now()
    this.saving = false

    if (this.pending) {
      const next = this.pending
      this.pending = null
      await this.save(next)
    }
  }

  clearLocal(): void {
    localStorage.removeItem(LOCAL_SAVE_KEY)
  }
}
