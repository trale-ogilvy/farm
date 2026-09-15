/**
 * Kiểu dữ liệu dùng chung cho toàn bộ engine.
 * Tách riêng khỏi Vue: không import gì từ `vue` trong thư mục `game/`.
 */

export type GroundKind = 'grass' | 'soil' | 'water' | 'path' | 'sand'
/** `house` là nhà chính ở tâm bản đồ — chiếm nhiều ô nhưng vẽ bằng một mesh. */
export type PropKind = 'tree' | 'rock' | 'bush' | 'stump' | 'house'

export type BuildingKind = 'cropPlot'

/**
 * Công trình đang xây trên một ô. `done` là khối lượng đã làm, so với
 * `workload` của loại công trình; đủ thì công trình hoàn thành và ô đổi trạng
 * thái (luống đất thì `tilled = true`). Dở dang thì cứ để đó, quay lại làm tiếp.
 */
export interface BuildSite {
  kind: BuildingKind
  done: number
}

export interface Vec2 {
  x: number
  z: number
}

/** Một ô trên lưới nông trại. */
export interface Tile {
  x: number
  z: number
  ground: GroundKind
  /** Đã cuốc thành luống chưa (chỉ có ý nghĩa với ground === 'soil'). */
  tilled: boolean
  /** Thời điểm game-time mà độ ẩm hết hiệu lực. */
  wetUntil: number
  prop: PropKind | null
  /** Máu của prop, để chặt cây / đập đá nhiều nhát. */
  propHp: number
  crop: Crop | null
  /** Công trình đã đặt xuống nhưng chưa xây xong. */
  site: BuildSite | null
  /**
   * Công trình đã xây xong trên ô này (null = không có). Với luống đất thì
   * `tilled` cũng bật; giữ cả hai vì `tilled` là trạng thái đất mà luật gieo/tưới
   * đọc, còn `building` là thứ dụng cụ dỡ bỏ nhìn vào.
   */
  building: BuildingKind | null
}

export interface Crop {
  typeId: string
  /** Tiến độ lớn tính bằng mili-giây game-time đã tích luỹ. */
  growth: number
  /** Giai đoạn hiện tại, cache lại để renderer biết khi nào cần rebuild. */
  stage: number
  /** Đã bị con gì/ai nhổ trộm chưa (dùng cho multiplayer sau này). */
  stolenBy?: string | null
}

export interface CropDef {
  id: string
  name: string
  /** Số giai đoạn sinh trưởng, giai đoạn cuối là thu hoạch được. */
  stages: number
  /** Tổng thời gian lớn (phút thực tế) khi được tưới đầy đủ. */
  growMinutes: number
  seedPrice: number
  sellPrice: number
  /** Số lần thu hoạch lại được (0 = nhổ luôn, >0 = ra quả tiếp). */
  regrow: number
  colorLeaf: number
  colorFruit: number
  shape: 'leafy' | 'vine' | 'stalk'
}

export type JobKind = 'idle' | 'water' | 'harvest' | 'gather' | 'follow'

export type PetState =
  | 'wander'
  | 'flee'
  | 'seek'
  | 'work'
  | 'follow'
  | 'rest'
  | 'stunned'

export interface PetDef {
  id: string
  name: string
  rarity: 'common' | 'uncommon' | 'rare'
  /** Các nghề pet này làm được. */
  skills: JobKind[]
  /** 0..1, càng cao càng khó bắt. */
  catchDifficulty: number
  speed: number
  bodyColor: number
  bellyColor: number
  scale: number
  /** Hình dáng thân — quyết định hàm dựng mesh nào được dùng. */
  body: 'round' | 'tall' | 'long'
  ears: 'none' | 'long' | 'horn'
}

export interface Pet {
  uid: string
  defId: string
  name: string
  x: number
  z: number
  /** Hướng nhìn tính bằng radian. */
  facing: number
  state: PetState
  job: JobKind
  /** Ô đang nhắm tới khi làm việc. */
  targetTile: Vec2 | null
  /** Điểm đích khi lang thang. */
  wanderTo: Vec2 | null
  stamina: number
  maxStamina: number
  level: number
  exp: number
  /** true = pet hoang trên bản đồ, false = pet đã thuộc về người chơi. */
  wild: boolean
  /** Bộ đếm thời gian cho hành động hiện tại (ms). */
  timer: number
}

export interface InventoryItem {
  id: string
  count: number
}

/**
 * `remove` là dụng cụ dỡ công trình: luôn có, luôn nằm ở ô nhanh cuối, không
 * kéo đi đâu được. Không có cuốc — luống đất chỉ đến từ xây dựng.
 */
export type ToolKind = 'wateringCan' | 'seedBag' | 'scythe' | 'axe' | 'ball' | 'remove'

export interface PlayerState {
  x: number
  z: number
  facing: number
  /** null = tay không: không dụng cụ nào được chọn ở dãy ô nhanh. */
  tool: ToolKind | null
  /** Sức làm việc: khối lượng công việc hoàn thành mỗi giây khi xây dựng. */
  work: number
  /**
   * Sáu ô dụng cụ nhanh, ứng với phím 1–6. Chỉ chứa dụng cụ: hạt giống và nông
   * sản không phải thứ "cầm trên tay", chúng đi theo hành động chứ không theo
   * lựa chọn của người chơi.
   */
  quickSlots: Array<ToolKind | null>
  /** Hạt giống đang chọn trong túi hạt. */
  selectedSeed: string
  coins: number
  inventory: InventoryItem[]
}

export interface WorldSnapshot {
  version: number
  savedAt: number
  gameTime: number
  player: PlayerState
  pets: Pet[]
  /** Chỉ lưu các ô đã bị thay đổi so với bản đồ gốc, tiết kiệm dung lượng. */
  tiles: Array<
    Pick<Tile, 'x' | 'z' | 'ground' | 'tilled' | 'wetUntil' | 'prop' | 'propHp'> & {
      crop: Crop | null
      site?: BuildSite | null
      building?: BuildingKind | null
    }
  >
}
