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
  pointerDown = false
  pointerJustDown = false
  /** Bánh xe cuộn tích luỹ trong frame, dùng để zoom. */
  wheel = 0

  private el: HTMLElement
  private bound: Array<[string, EventListener, EventTarget]> = []

  constructor(el: HTMLElement) {
    this.el = el
    this.listen(window, 'keydown', (e) => this.onKey(e as KeyboardEvent, true))
    this.listen(window, 'keyup', (e) => this.onKey(e as KeyboardEvent, false))
    this.listen(window, 'blur', () => this.down.clear())
    this.listen(el, 'pointermove', (e) => this.onPointerMove(e as PointerEvent))
    this.listen(el, 'pointerdown', (e) => this.onPointerDown(e as PointerEvent))
    this.listen(window, 'pointerup', () => {
      this.pointerDown = false
    })
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
      if (code.startsWith('Arrow') || code === 'Space' || code === 'Tab') e.preventDefault()
    } else {
      this.down.delete(code)
      this.released.add(code)
    }
  }

  private onPointerMove(e: PointerEvent) {
    const rect = this.el.getBoundingClientRect()
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  }

  private onPointerDown(e: PointerEvent) {
    this.onPointerMove(e)
    this.pointerDown = true
    this.pointerJustDown = true
  }

  isDown(code: string): boolean {
    return this.down.has(code)
  }

  justPressed(code: string): boolean {
    return this.pressed.has(code)
  }

  /** Vector di chuyển thô theo màn hình, đã chuẩn hoá độ dài. */
  moveAxis(): { x: number; y: number } {
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
    this.pointerJustDown = false
    this.wheel = 0
  }

  dispose(): void {
    for (const [type, fn, target] of this.bound) target.removeEventListener(type, fn)
    this.bound = []
    this.down.clear()
  }
}
