import type { FirebaseApp } from 'firebase/app'
import type { Auth, User } from 'firebase/auth'
import type { Firestore } from 'firebase/firestore'

export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket?: string
  messagingSenderId?: string
  appId: string
}

interface FirebaseBundle {
  app: FirebaseApp
  auth: Auth
  db: Firestore
  user: User
}

let bundle: FirebaseBundle | null = null
let initPromise: Promise<FirebaseBundle | null> | null = null

export function hasFirebaseConfig(cfg: Partial<FirebaseConfig>): cfg is FirebaseConfig {
  return Boolean(cfg.apiKey && cfg.projectId && cfg.appId)
}

/**
 * Khởi tạo Firebase lười và chỉ một lần. SDK được import động để không nằm
 * trong bundle đầu — người chơi chưa cấu hình Firebase vẫn tải game nhanh.
 */
export async function initFirebase(
  cfg: Partial<FirebaseConfig>,
): Promise<FirebaseBundle | null> {
  if (bundle) return bundle
  if (initPromise) return initPromise

  if (!hasFirebaseConfig(cfg)) return null

  initPromise = (async () => {
    try {
      const [{ initializeApp, getApps }, authMod, firestoreMod] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ])

      const app = getApps()[0] ?? initializeApp(cfg)
      const auth = authMod.getAuth(app)
      const db = firestoreMod.getFirestore(app)

      const user =
        auth.currentUser ?? (await authMod.signInAnonymously(auth)).user

      bundle = { app, auth, db, user }
      return bundle
    } catch (err) {
      console.warn('[firebase] khởi tạo thất bại, dùng localStorage thay thế:', err)
      return null
    } finally {
      initPromise = null
    }
  })()

  return initPromise
}

export function currentBundle(): FirebaseBundle | null {
  return bundle
}
