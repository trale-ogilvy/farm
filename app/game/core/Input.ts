/**
 * Gom toàn bộ input thô. Không biết gì về gameplay — chỉ trả lời "phím nào đang
 * giữ", "phím nào vừa bấm frame này", và con trỏ đang ở đâu (toạ độ NDC).
 */
export class Input {
  private down = new Set<string>()
  private pressed = new Set<string>()
  private released = new Set<string>()

  /** Toạ độ chuột chuẩn hoá -1..1, dùng thẳng cho Raycaster. */
  pointer = { x: 0, y: 0 }
  /** Con trỏ có đang nằm trên canvas không — rời sang HUD thì thôi highlight. */
  pointerInside = false
  /** Con trỏ đã di chuyển từ frame trước chưa — dùng để bỏ qua raycast thừa. */
  pointerMoved = false
  /** Chuột trái vừa bấm xuống trong frame này: dùng dụng cụ lên chỗ đang chỉ. */
  primaryJustDown = false
  /** Chuột phải đang giữ: xoay camera. */
  secondaryDown = false
  /** Quãng kéo chuột phải tích luỹ trong frame, đơn vị pixel. */
  rotateDelta = { x: 0, y: 0 }
  /** Bánh xe cuộn tích luỹ trong frame, dùng để zoom. */
  wheel = 0

  /**
   * Lớp UI đang chiếm bàn phím (ba lô mở, điều hướng ô bằng WASD).
   *
   * Chặn ngay tại đây chứ không rải `if (uiOpen)` khắp Engine: chỉ cần một chỗ
   * này sai là nhân vật vẫn chạy sau lưng bảng đang mở.
   */
  captured = false

  /** Vẫn lọt qua khi bị chiếm — nếu không thì không còn đường đóng bảng. */
  private static readonly ESCAPES = new Set(['Escape', 'KeyI'])

  private el: HTMLElement
  private bound: Array<[string, EventListener, EventTarget]> = []

  constructor(el: HTMLElement) {
    this.el = el
    this.listen(window, 'keydown', (e) => this.onKey(e as KeyboardEvent, true))
    this.listen(window, 'keyup', (e) => this.onKey(e as KeyboardEvent, false))
    this.listen(window, 'blur', () => {
      this.down.clear()
      this.secondaryDown = false
    })
    this.listen(el, 'pointermove', (e) => this.onPointerMove(e as PointerEvent))
    this.listen(el, 'pointerenter', () => (this.pointerInside = true))
    this.listen(el, 'pointerleave', () => (this.pointerInside = false))
    this.listen(el, 'pointerdown', (e) => this.onPointerDown(e as PointerEvent))
    this.listen(window, 'pointerup', (e) => this.onPointerUp(e as PointerEvent))
    this.listen(el, 'wheel', (e) => {
      this.wheel += (e as WheelEvent).deltaY
      e.preventDefault()
    })
    this.listen(el, 'contextmenu', (e) => e.preventDefault())
  }

  private listen(target: EventTarget, type: string, fn: EventListener) {
    const opts = type === 'wheel' ? { passive: false } : undefined
    target.addEventListener(type, fn, opts)
    this.bound.push([type, fn, target])
  }

  private onKey(e: KeyboardEvent, isDown: boolean) {
    // Bỏ qua khi người chơi đang gõ vào ô input của UI.
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return

    const code = e.code
    if (isDown) {
      if (!this.down.has(code)) this.pressed.add(code)
      this.down.add(code)
      // Chặn cuộn trang khi bấm phím điều khiển.
      if (code.startsWith('Arrow') || code === 'Tab') e.preventDefault()
    } else {
      this.down.delete(code)
      this.released.add(code)
    }
  }

  private onPointerMove(e: PointerEvent) {
    const rect = this.el.getBoundingClientRect()
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
    const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1
    if (nx !== this.pointer.x || ny !== this.pointer.y) this.pointerMoved = true
    this.pointer.x = nx
    this.pointer.y = ny
    this.pointerInside = true

    // Giữ chuột phải và rê = xoay camera. movementX/Y đã tính sẵn quãng kéo nên
    // không phải tự nhớ vị trí frame trước.
    if (this.secondaryDown) {
      this.rotateDelta.x += e.movementX
      this.rotateDelta.y += e.movementY
    }
  }

  private onPointerDown(e: PointerEvent) {
    this.onPointerMove(e)
    if (e.button === 0) {
      this.primaryJustDown = true
    } else if (e.button === 2) {
      this.secondaryDown = true
      this.el.setPointerCapture?.(e.pointerId)
    }
  }

  private onPointerUp(e: PointerEvent) {
    if (e.button === 2) {
      this.secondaryDown = false
      this.el.releasePointerCapture?.(e.pointerId)
    }
  }

  isDown(code: string): boolean {
    if (this.captured && !Input.ESCAPES.has(code)) return false
    return this.down.has(code)
  }

  justPressed(code: string): boolean {
    if (this.captured && !Input.ESCAPES.has(code)) return false
    return this.pressed.has(code)
  }

  /** Vector di chuyển thô theo màn hình, đã chuẩn hoá độ dài. */
  moveAxis(): { x: number; y: number } {
    if (this.captured) return { x: 0, y: 0 }
    let x = 0
    let y = 0
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y -= 1
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y += 1
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1
    const len = Math.hypot(x, y)
    return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 }
  }

  /** Gọi ở cuối mỗi frame để xoá các trạng thái "vừa xảy ra". */
  endFrame(): void {
    this.pressed.clear()
    this.released.clear()
    this.primaryJustDown = false
    this.pointerMoved = false
    this.rotateDelta.x = 0
    this.rotateDelta.y = 0
    this.wheel = 0
  }

  dispose(): void {
    for (const [type, fn, target] of this.bound) target.removeEventListener(type, fn)
    this.bound = []
    this.down.clear()
  }
}
