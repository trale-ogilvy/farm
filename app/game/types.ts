/**
 * Kiểu dữ liệu dùng chung cho toàn bộ engine.
 * Tách riêng khỏi Vue: không import gì từ `vue` trong thư mục `game/`.
 */

export type GroundKind = 'grass' | 'soil' | 'water' | 'path'
export type PropKind = 'tree' | 'rock' | 'bush' | 'stump'

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

export type ToolKind = 'hoe' | 'wateringCan' | 'seedBag' | 'scythe' | 'axe' | 'ball'

export interface PlayerState {
  x: number
  z: number
  facing: number
  tool: ToolKind
  /** Hạt giống đang chọn trong túi hạt. */
  selectedSeed: string
  coins: number
  energy: number
  maxEnergy: number
  water: number
  maxWater: number
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
    }
  >
}
