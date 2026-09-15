/**
 * Ghi lại VÌ SAO trang bị tải lại khi chạy dev.
 *
 * Vite tải lại trang vì nhiều lý do khác nhau và mỗi lý do có một event riêng.
 * Khi trang đã reload thì console bị xoá sạch, nên ngoài việc log ngay lúc xảy
 * ra, ta còn ghi lý do vào sessionStorage để in lại ở lần khởi động kế tiếp —
 * đó mới là thứ đọc được sau khi sự việc đã rồi.
 */
const BOOT_KEY = 'farm:dev:lastBoot'
const CAUSE_KEY = 'farm:dev:reloadCause'

export default defineNuxtPlugin(() => {
  if (!import.meta.dev) return

  const now = Date.now()
  const style = 'color:#7ee07e;font-weight:bold'

  // --- Báo cáo về lần tải trang TRƯỚC ---
  try {
    const last = Number(sessionStorage.getItem(BOOT_KEY) || 0)
    const cause = sessionStorage.getItem(CAUSE_KEY)
    if (last) {
      const gap = ((now - last) / 1000).toFixed(1)
      console.warn(
        `%c[farm] Trang vừa TẢI LẠI sau ${gap}s. Nguyên nhân: ${cause || 'không rõ (không phải Vite HMR)'}`,
        'color:#ffb454;font-weight:bold',
      )
      if (!cause) {
        console.warn(
          '[farm] Vite không báo gì trước khi reload. Thường là một trong:\n' +
            '  · dev server tự khởi động lại (đổi nuxt.config.ts / .env / cài package)\n' +
            '  · mất kết nối websocket HMR rồi nối lại (máy ngủ, đổi mạng)\n' +
            '  · tiến trình render của Chrome sập (kiểm tra chrome://crashes)',
        )
      }
    } else {
      console.info(`%c[farm] Khởi động lần đầu trong phiên này`, style)
    }
    sessionStorage.setItem(BOOT_KEY, String(now))
    sessionStorage.removeItem(CAUSE_KEY)
  } catch {
    /* sessionStorage bị chặn thì bỏ qua phần chẩn đoán */
  }

  // --- Bắt lý do cho lần reload SẮP tới ---
  const hot = import.meta.hot
  if (!hot) return

  const remember = (cause: string) => {
    try {
      sessionStorage.setItem(CAUSE_KEY, cause)
    } catch {
      /* bỏ qua */
    }
    console.warn(`%c[farm] Vite sắp tải lại trang: ${cause}`, 'color:#ff8080;font-weight:bold')
  }

  hot.on('vite:beforeFullReload', (payload: { path?: string }) => {
    remember(`full reload do file "${payload?.path ?? 'không rõ'}" thay đổi`)
  })
  hot.on('vite:invalidate', (payload: { path?: string; message?: string }) => {
    remember(`module bị invalidate: ${payload?.path ?? '?'} ${payload?.message ?? ''}`)
  })
  hot.on('vite:ws:disconnect', () => {
    remember('mất kết nối HMR websocket (nối lại thường kéo theo reload)')
  })
  hot.on('vite:error', (payload: { err?: { message?: string } }) => {
    remember(`lỗi build: ${payload?.err?.message ?? 'không rõ'}`)
  })
  hot.on('vite:ws:connect', () => {
    console.info('%c[farm] HMR websocket đã kết nối', style)
  })
})
