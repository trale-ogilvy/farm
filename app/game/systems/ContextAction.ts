import type { Grid } from '../world/Grid'
import type { Player } from '../entities/Player'
import type { PetSystem } from './PetSystem'
import type { Tile, ToolKind } from '../types'
import { cropDef, isHarvestable } from '../data/crops'

export type ActionKind =
  | 'till'
  | 'plant'
  | 'water'
  | 'harvest'
  | 'chop'
  | 'refill'
  | 'catch'

/** Animation tương ứng — quyết định nhân vật vung tay hay cúi xuống. */
export type ActionAnim = 'swing' | 'water' | 'plant' | 'harvest' | 'throw'

export interface ActionTarget {
  kind: ActionKind
  /** Chữ hiện trong bong bóng, ví dụ "TRỒNG". */
  label: string
  anim: ActionAnim
  /**
   * Dụng cụ dùng cho việc này. Với việc cần dụng cụ thì luôn khớp
   * `player.state.tool`; với việc tay không (gieo, thu hoạch) thì đây chỉ là
   * đạo cụ animation và có thể khác thứ đang cầm.
   */
  tool: ToolKind
  /** Điểm neo bong bóng trong không gian thế giới. */
  x: number
  y: number
  z: number
  tile: { x: number; z: number } | null
  petUid: string | null
  /**
   * false = hành động đúng ngữ cảnh nhưng thiếu tài nguyên (hết hạt, hết nước).
   * Bong bóng vẫn hiện nhưng mờ đi, và bấm F sẽ nói rõ thiếu gì — im lặng hoàn
   * toàn ở trường hợp này khiến người chơi tưởng phím hỏng.
   */
  enabled: boolean
  reason?: string
}

/** Bán kính với tới, tính bằng ô. Bao trọn 8 ô quanh người chơi. */
const REACH = 1.75
/** Bán kính ném bóng vào pet hoang khi chơi bằng bàn phím. */
const PET_REACH = 3.2

/**
 * Góc nhắm: chỉ xét thứ nằm trong nón ~44° trước mặt (cos 44° ≈ 0.72).
 *
 * Nón hẹp là điều kiện để "ngắm bằng cách xoay người" hoạt động được. Rộng hơn
 * thì các ô CHÉO cũng lọt vào, và đứng trước một cây vừa tưới xong vẫn thấy
 * bong bóng CUỐC chĩa sang bên — đúng thứ mà yêu cầu "không làm được gì thì
 * không hiện" muốn tránh.
 *
 * Bù lại độ hẹp, ô ngay trước mặt LUÔN được xét (xem `frontTile` bên dưới), nên
 * không bao giờ có chuyện đứng sát mục tiêu mà bong bóng biến mất.
 */
const AIM_CONE = 0.72
/** Pet thì nới ra một chút vì chúng di chuyển liên tục. */
const PET_CONE = 0.2

/**
 * Thứ tự ưu tiên khi nhiều thứ cùng nằm trong tầm.
 *
 * Cuốc đất xếp bét vì cỏ thì ở khắp nơi — nếu chấm điểm thuần theo khoảng cách,
 * một ô cỏ sát chân sẽ luôn cướp mất cây chín ngay trước mặt. Bắt pet xếp đầu vì
 * pet hoang bỏ chạy, cơ hội không quay lại.
 */
const PRIORITY: Record<ActionKind, number> = {
  catch: 6,
  harvest: 5,
  water: 4,
  plant: 3,
  chop: 2,
  refill: 2,
  till: 1,
}

const LABELS: Record<ActionKind, string> = {
  till: 'CUỐC',
  plant: 'TRỒNG',
  water: 'TƯỚI',
  harvest: 'THU HOẠCH',
  chop: 'CHẶT',
  refill: 'MÚC NƯỚC',
  catch: 'BẮT',
}

const ANIMS: Record<ActionKind, ActionAnim> = {
  till: 'swing',
  plant: 'plant',
  water: 'water',
  harvest: 'harvest',
  chop: 'swing',
  refill: 'water',
  catch: 'throw',
}

/**
 * Dụng cụ của từng việc. Với việc cần dụng cụ thì đây là ĐIỀU KIỆN; với việc
 * chỉ cần tới gần thì nó chỉ là đạo cụ cho animation — nhân vật vẫn rút đúng
 * thứ ra dùng rồi cất đi, dù người chơi không hề chọn nó ở hotbar.
 */
const TOOLS: Record<ActionKind, ToolKind> = {
  till: 'hoe',
  plant: 'seedBag',
  water: 'wateringCan',
  harvest: 'scythe',
  chop: 'axe',
  refill: 'wateringCan',
  catch: 'ball',
}

/**
 * Hai loại việc, phân theo câu hỏi: không có dụng cụ thì có làm được không?
 *
 * CẦN DỤNG CỤ — mở luống, tưới, múc nước, chặt, ném bóng. Tay không thì không
 * bổ được đất hay hạ được cây, và bóng thì phải có bóng mới ném. Bắt chọn dụng
 * cụ ở đây còn là cách lọc: cỏ phủ kín bản đồ, nếu ô cỏ nào cũng tự mời CUỐC
 * thì đi đâu cũng thấy bong bóng và nó hết tác dụng báo "chỗ này có việc".
 *
 * CHỈ CẦN TỚI GẦN — gieo hạt, thu hoạch. Đây là việc của bàn tay: rắc hạt
 * xuống luống, hái quả chín. Bắt chọn dụng cụ trước chỉ thêm một bước vô nghĩa
 * giữa "thấy luống trống" và "gieo". Hai việc này cũng không gây nhiễu, vì
 * luống trống và cây chín chỉ có ở chỗ người chơi tự tạo ra.
 */
const NEEDS_TOOL: Record<ActionKind, boolean> = {
  till: true,
  water: true,
  refill: true,
  chop: true,
  catch: true,
  plant: false,
  harvest: false,
}

/**
 * Chọn MỘT việc đáng làm nhất quanh người chơi.
 *
 * Nguyên tắc: mỗi ô chỉ có đúng một hành động hợp lý, suy ra từ trạng thái của
 * chính nó — đất chưa cuốc thì cuốc, luống trống thì gieo, cây khát thì tưới,
 * cây chín thì thu.
 *
 * Trên nguyên tắc đó có thêm một lớp lọc, nhưng chỉ áp cho một nửa số việc:
 * việc CẦN DỤNG CỤ thì phải đang cầm đúng thứ mới hiện, việc TAY KHÔNG thì tới
 * gần là hiện (xem `NEEDS_TOOL`).
 */
export function resolveAction(
  grid: Grid,
  player: Player,
  pets: PetSystem,
  now: number,
): ActionTarget | null {
  const px = player.state.x
  const pz = player.state.z
  const fx = Math.sin(player.state.facing)
  const fz = Math.cos(player.state.facing)

  let best: ActionTarget | null = null
  let bestScore = -Infinity

  const consider = (
    kind: ActionKind,
    wx: number,
    wz: number,
    anchorY: number,
    tile: { x: number; z: number } | null,
    petUid: string | null,
    enabled: boolean,
    reason?: string,
  ) => {
    // Việc cần dụng cụ mà cầm sai thì coi như không có việc: không bong bóng,
    // không highlight. Việc tay không thì bỏ qua cửa này.
    if (NEEDS_TOOL[kind] && TOOLS[kind] !== player.state.tool) return

    const dx = wx - px
    const dz = wz - pz
    const dist = Math.hypot(dx, dz)
    const reach = petUid ? PET_REACH : REACH
    if (dist > reach) return

    const isFront = tile != null && tile.x === frontX && tile.z === frontZ
    const align = dist < 0.001 ? 1 : (dx * fx + dz * fz) / dist
    if (!isFront && align < (petUid ? PET_CONE : AIM_CONE)) return

    // Tầng ưu tiên quyết định trước, hướng nhìn và khoảng cách chỉ phân xử
    // trong cùng một tầng.
    const score = PRIORITY[kind] * 10 + align * 3 - dist * 0.8 + (enabled ? 0.5 : 0)
    if (score <= bestScore) return

    bestScore = score
    best = {
      kind,
      label: LABELS[kind],
      anim: ANIMS[kind],
      tool: TOOLS[kind],
      x: wx,
      y: anchorY,
      z: wz,
      tile,
      petUid,
      enabled,
      reason,
    }
  }

  // Ô ngay trước mặt luôn là ứng viên, bất kể nón nhắm. Đây là bảo đảm để
  // người chơi không bao giờ phải "dò" góc đứng cho đúng.
  const frontX = Math.round(px + fx)
  const frontZ = Math.round(pz + fz)

  const x0 = Math.max(0, Math.floor(px - REACH))
  const x1 = Math.min(grid.width - 1, Math.ceil(px + REACH))
  const z0 = Math.max(0, Math.floor(pz - REACH))
  const z1 = Math.min(grid.height - 1, Math.ceil(pz + REACH))

  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      // Bỏ qua ô mình đang đứng: tác động vào chỗ dưới chân thì bong bóng bị
      // chính nhân vật che, và không đọc ra được là đang làm gì ở đâu.
      if (x === Math.round(px) && z === Math.round(pz)) continue
      const tile = grid.at(x, z)
      if (!tile) continue
      const found = tileAction(tile, player, now)
      if (!found) continue
      const groundY = grid.heights.tileHeight(x, z)
      consider(
        found.kind,
        x,
        z,
        groundY + found.lift,
        { x, z },
        null,
        found.enabled,
        found.reason,
      )
    }
  }

  // Pet hoang: ném bóng bắt, để chơi bằng bàn phím vẫn thu thập được.
  const ball = player.state.inventory.find((i) => i.id === 'ball')
  for (const pet of pets.pets) {
    if (!pet.wild) continue
    consider(
      'catch',
      pet.x,
      pet.z,
      grid.groundY(pet.x, pet.z) + 1.05,
      null,
      pet.uid,
      !!ball && ball.count > 0,
      'Hết bóng bắt pet',
    )
  }

  return best
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
 * do `consider` lọc theo `NEEDS_TOOL`. Tách ra để một ô luôn có đúng một ý
 * nghĩa, bất kể hotbar.
 */
function tileAction(tile: Tile, player: Player, now: number): TileAction | null {
  const s = player.state

  if (tile.prop === 'tree' || tile.prop === 'bush' || tile.prop === 'rock' || tile.prop === 'stump') {
    if (tile.propHp >= 999) return null // cây viền bản đồ, chặt không được
    const lift = tile.prop === 'tree' ? 2.5 : tile.prop === 'stump' ? 0.5 : 0.8
    return { kind: 'chop', lift, enabled: s.energy >= 4, reason: 'Hết sức rồi, đi ngủ đi' }
  }

  if (tile.ground === 'water') {
    return {
      kind: 'refill',
      lift: 0.5,
      enabled: s.water < s.maxWater,
      reason: 'Bình đã đầy',
    }
  }

  if (tile.crop) {
    const def = cropDef(tile.crop.typeId)
    if (isHarvestable(def, tile.crop)) {
      return { kind: 'harvest', lift: 0.9, enabled: s.energy >= 1, reason: 'Hết sức rồi' }
    }
    // Cây đang lớn: chỉ mời tưới khi đất đã khô. Cây vừa tưới xong thì không
    // còn việc gì để làm, nên không hiện bong bóng.
    if (tile.wetUntil <= now) {
      return {
        kind: 'water',
        lift: 0.75,
        enabled: s.water > 0,
        reason: 'Hết nước — ra ao múc thêm',
      }
    }
    return null
  }

  if (tile.tilled) {
    // Xét CÒN HẠT NÀO KHÔNG, không xét loại đang chọn: bấm F ở đây chỉ mở bảng
    // chọn hạt, mà bảng đó cho chọn bất kỳ loại nào trong túi.
    const hasSeed = s.inventory.some((i) => i.id.startsWith('seed:') && i.count > 0)
    return {
      kind: 'plant',
      lift: 0.5,
      enabled: hasSeed,
      reason: 'Hết sạch hạt giống — ra cửa hàng mua thêm',
    }
  }

  if (tile.ground === 'grass' || tile.ground === 'soil') {
    return { kind: 'till', lift: 0.45, enabled: s.energy >= 3, reason: 'Hết sức rồi, đi ngủ đi' }
  }

  return null
}
