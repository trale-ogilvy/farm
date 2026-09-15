import type { Grid } from '../world/Grid'
import type { Player } from '../entities/Player'
import type { PetSystem } from './PetSystem'
import type { Tile, ToolKind } from '../types'
import { cropDef, isHarvestable } from '../data/crops'

export type ActionKind =
  | 'remove'
  | 'plant'
  | 'water'
  | 'harvest'
  | 'chop'
  | 'catch'

/** Animation tương ứng — quyết định nhân vật vung tay hay cúi xuống. */
export type ActionAnim = 'swing' | 'water' | 'plant' | 'harvest' | 'throw' | 'build'

/** Chỗ con trỏ chuột đang chỉ xuống mặt đất: ô lưới và điểm chính xác. */
export interface Cursor {
  x: number
  z: number
  wx: number
  wz: number
}

export interface ActionTarget {
  kind: ActionKind
  /** Chữ hiện trong bong bóng, ví dụ "TRỒNG". */
  label: string
  anim: ActionAnim
  /** Dụng cụ dùng cho việc này — luôn trùng với thứ đang cầm. */
  tool: ToolKind
  /** Điểm neo bong bóng trong không gian thế giới. */
  x: number
  y: number
  z: number
  tile: { x: number; z: number } | null
  petUid: string | null
  /**
   * Nhân vật có với tới không. Ngoài tầm thì vẫn highlight (màu đỏ) để người
   * chơi biết "đúng thứ đó, nhưng phải lại gần" — chứ không phải "chỗ đó không
   * làm được gì".
   */
  inRange: boolean
  /**
   * false = hành động đúng ngữ cảnh nhưng thiếu tài nguyên (hết hạt, hết nước).
   * Bong bóng vẫn hiện nhưng mờ đi, và bấm vào sẽ nói rõ thiếu gì — im lặng
   * hoàn toàn ở trường hợp này khiến người chơi tưởng chuột hỏng.
   */
  enabled: boolean
  reason?: string
}

/** Tầm với của dụng cụ, tính bằng ô. Xa hơn thì phải đi lại gần. */
export const REACH = 2.6
/** Bán kính ném bóng vào pet hoang. */
export const PET_REACH = 3.2
/** Con trỏ cách pet bao xa vẫn tính là đang chỉ vào nó. */
const PET_PICK_RADIUS = 0.9

const LABELS: Record<ActionKind, string> = {
  remove: 'DỠ BỎ',
  plant: 'TRỒNG',
  water: 'TƯỚI',
  harvest: 'THU HOẠCH',
  chop: 'CHẶT',
  catch: 'BẮT',
}

const ANIMS: Record<ActionKind, ActionAnim> = {
  remove: 'swing',
  plant: 'plant',
  water: 'water',
  harvest: 'harvest',
  chop: 'swing',
  catch: 'throw',
}

/**
 * Dụng cụ của từng việc. Đây là ĐIỀU KIỆN: cầm sai thì ô đó coi như không có
 * việc — không highlight, không bong bóng, bấm vào không có gì xảy ra.
 *
 * Mọi việc đều đi qua cửa này, kể cả gieo và thu hoạch. Lối chơi bằng chuột
 * là "chọn dụng cụ rồi chỉ vào thứ cần làm": dụng cụ đang cầm chính là cách
 * người chơi nói mình định làm gì, nên nó phải nhất quán — không thể cầm cuốc
 * mà bấm vào cây chín lại thành thu hoạch.
 */
const TOOLS: Record<ActionKind, ToolKind> = {
  remove: 'remove',
  plant: 'seedBag',
  water: 'wateringCan',
  harvest: 'scythe',
  chop: 'axe',
  catch: 'ball',
}

/**
 * Việc ở chỗ con trỏ đang chỉ, với dụng cụ đang cầm.
 *
 * Nguyên tắc: mỗi ô chỉ có đúng một hành động hợp lý, suy ra từ trạng thái của
 * chính nó — đất chưa cuốc thì cuốc, luống trống thì gieo, cây khát thì tưới,
 * cây chín thì thu. Con trỏ chọn Ô, dụng cụ lọc VIỆC; hai thứ khớp nhau thì
 * có mục tiêu, không thì null.
 *
 * Khoảng cách KHÔNG lọc ở đây mà chỉ ghi vào `inRange`: mục tiêu ngoài tầm
 * vẫn cần được vẽ ra (màu đỏ) để người chơi hiểu vì sao bấm không ăn.
 */
export function resolveAction(
  grid: Grid,
  player: Player,
  pets: PetSystem,
  now: number,
  cursor: Cursor | null,
): ActionTarget | null {
  if (!cursor) return null

  const px = player.state.x
  const pz = player.state.z
  const tool = player.state.tool
  // Tay không thì không có việc gì để chỉ vào: mọi việc đều cần dụng cụ.
  if (!tool) return null

  // Bóng nhắm vào PET chứ không vào ô: con trỏ ở gần con nào thì là con đó.
  if (tool === 'ball') {
    const pet = pets.nearestWild(cursor.wx, cursor.wz, PET_PICK_RADIUS)
    if (!pet) return null
    const ball = player.state.inventory.find((i) => i.id === 'ball')
    return {
      kind: 'catch',
      label: LABELS.catch,
      anim: ANIMS.catch,
      tool: 'ball',
      x: pet.x,
      y: grid.groundY(pet.x, pet.z) + 1.05,
      z: pet.z,
      tile: null,
      petUid: pet.uid,
      inRange: Math.hypot(pet.x - px, pet.z - pz) <= PET_REACH,
      enabled: !!ball && ball.count > 0,
      reason: 'Hết bóng bắt pet',
    }
  }

  const tile = grid.at(cursor.x, cursor.z)
  if (!tile) return null

  // Dụng cụ dỡ bỏ nhìn vào CÔNG TRÌNH chứ không vào trạng thái đất, nên không
  // đi qua `tileAction` — một luống trống với nó là "thứ để dỡ", với túi hạt là
  // "chỗ để gieo"; hai dụng cụ, hai câu hỏi khác nhau về cùng một ô.
  if (tool === 'remove') {
    const kind = grid.removableAt(tile.x, tile.z)
    if (!kind) return null
    return {
      kind: 'remove',
      label: LABELS.remove,
      anim: ANIMS.remove,
      tool,
      x: tile.x,
      y: grid.heights.tileHeight(tile.x, tile.z) + 0.6,
      z: tile.z,
      tile: { x: tile.x, z: tile.z },
      petUid: null,
      inRange: Math.hypot(tile.x - px, tile.z - pz) <= REACH,
      enabled: true,
    }
  }

  const found = tileAction(tile, player, now)
  if (!found || TOOLS[found.kind] !== tool) return null

  return {
    kind: found.kind,
    label: LABELS[found.kind],
    anim: ANIMS[found.kind],
    tool,
    x: tile.x,
    y: grid.heights.tileHeight(tile.x, tile.z) + found.lift,
    z: tile.z,
    tile: { x: tile.x, z: tile.z },
    petUid: null,
    inRange: Math.hypot(tile.x - px, tile.z - pz) <= REACH,
    enabled: found.enabled,
    reason: found.reason,
  }
}

interface TileAction {
  kind: ActionKind
  /** Bong bóng cao hơn mặt đất bao nhiêu — cây to thì phải đẩy lên cao hơn. */
  lift: number
  enabled: boolean
  reason?: string
}

/**
 * Luật ngữ cảnh cho MỘT ô. Thứ tự các nhánh chính là thứ tự ưu tiên: việc nào
 * người chơi mong đợi nhất khi nhìn vào ô đó thì đặt trước.
 *
 * Hàm này KHÔNG xét dụng cụ — nó trả lời "ô này cần gì", còn "tay đang cầm gì"
 * do `resolveAction` đối chiếu qua `TOOLS`. Tách ra để một ô luôn có đúng một
 * ý nghĩa, bất kể hotbar.
 */
function tileAction(tile: Tile, player: Player, now: number): TileAction | null {
  const s = player.state

  // Bãi công trình: việc duy nhất ở đây là XÂY, mà xây đi lối riêng (tới gần,
  // bấm F) chứ không qua dụng cụ — nên với chuột thì ô này không có việc.
  if (tile.site) return null

  if (tile.prop === 'tree' || tile.prop === 'bush' || tile.prop === 'rock' || tile.prop === 'stump') {
    if (tile.propHp >= 999) return null // cây viền bản đồ, chặt không được
    const lift = tile.prop === 'tree' ? 2.5 : tile.prop === 'stump' ? 0.5 : 0.8
    return { kind: 'chop', lift, enabled: true }
  }

  if (tile.crop) {
    const def = cropDef(tile.crop.typeId)
    if (isHarvestable(def, tile.crop)) {
      return { kind: 'harvest', lift: 0.9, enabled: true }
    }
    // Cây đang lớn: chỉ mời tưới khi đất đã khô. Cây vừa tưới xong thì không
    // còn việc gì để làm, nên không highlight.
    if (tile.wetUntil <= now) {
      return { kind: 'water', lift: 0.75, enabled: true }
    }
    return null
  }

  if (tile.tilled) {
    // Xét CÒN HẠT NÀO KHÔNG, không xét loại đang chọn: bấm vào đây chỉ mở bảng
    // chọn hạt, mà bảng đó cho chọn bất kỳ loại nào trong túi.
    const hasSeed = s.inventory.some((i) => i.id.startsWith('seed:') && i.count > 0)
    return {
      kind: 'plant',
      lift: 0.5,
      enabled: hasSeed,
      reason: 'Hết sạch hạt giống — ra cửa hàng mua thêm',
    }
  }

  return null
}
