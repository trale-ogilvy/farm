import type { PetDef } from '../types'

/**
 * Hai loại pet: loài dựng bằng code (chỉ cần vài tham số hình dáng + màu) và
 * loài có `model` glTF (xem `render/models/petModels.ts`) — loài này vẫn khai
 * đủ hình dáng/màu để hiện tạm bằng khối trong lúc model chưa tải xong.
 */
export const PETS: Record<string, PetDef> = {
  chippo: {
    id: 'chippo',
    name: 'Chippo',
    rarity: 'common',
    skills: ['water', 'gather', 'follow'],
    catchDifficulty: 0.2,
    speed: 2.6,
    bodyColor: 0xf0b45c,
    bellyColor: 0xfde8c4,
    scale: 0.8,
    body: 'round',
    ears: 'long',
  },
  mossling: {
    id: 'mossling',
    name: 'Mossling',
    rarity: 'common',
    skills: ['harvest', 'gather', 'follow'],
    catchDifficulty: 0.25,
    speed: 2.2,
    bodyColor: 0x7bbf5a,
    bellyColor: 0xd8f0b8,
    scale: 0.85,
    body: 'round',
    ears: 'none',
  },
  dripsy: {
    id: 'dripsy',
    name: 'Dripsy',
    rarity: 'uncommon',
    skills: ['water', 'follow'],
    catchDifficulty: 0.45,
    speed: 3.0,
    bodyColor: 0x5fa8d8,
    bellyColor: 0xcfeaf7,
    scale: 0.75,
    body: 'tall',
    ears: 'none',
  },
  tuskan: {
    id: 'tuskan',
    name: 'Tuskan',
    rarity: 'uncommon',
    skills: ['harvest', 'gather', 'follow'],
    catchDifficulty: 0.5,
    speed: 2.0,
    bodyColor: 0xb98b6a,
    bellyColor: 0xe8d2bb,
    scale: 1.15,
    body: 'long',
    ears: 'horn',
  },
  emberix: {
    id: 'emberix',
    name: 'Emberix',
    rarity: 'rare',
    skills: ['water', 'harvest', 'gather', 'follow'],
    catchDifficulty: 0.75,
    speed: 3.4,
    bodyColor: 0xe2683f,
    bellyColor: 0xffd39b,
    scale: 1.0,
    body: 'tall',
    ears: 'horn',
  },

  // --- Pet vẽ bằng model glTF. Màu/dáng dưới đây là bản khối dự phòng. ---
  // `speed` = tốc độ tự nhiên của clip Walk × 1.4 (PetView đo sải chân lúc tải
  // model, xem log dev "[pet] ..."): pet đi bộ, timeScale bù 1.4× nên chân
  // không trượt; bỏ chạy ×1.5 thì tự chuyển sang Run vì gần tốc độ đó hơn.
  // Tăng speed quá ~2× Walk là PetView chuyển Run; quá 2.2× Run là lại trượt.
  frog: {
    id: 'frog',
    name: 'Ếch',
    rarity: 'common',
    skills: ['water', 'follow'],
    catchDifficulty: 0.2,
    speed: 0.5,
    bodyColor: 0x7cb85c,
    bellyColor: 0xe6f0c8,
    scale: 0.7,
    body: 'round',
    ears: 'none',
    model: 'frog',
  },
  chillet: {
    id: 'chillet',
    name: 'Chillet',
    rarity: 'common',
    skills: ['gather', 'follow'],
    catchDifficulty: 0.3,
    speed: 0.7,
    bodyColor: 0xf3e9d6,
    bellyColor: 0xcfe9f5,
    scale: 0.9,
    body: 'long',
    ears: 'long',
    model: 'chillet',
  },
  caprity: {
    id: 'caprity',
    name: 'Caprity',
    rarity: 'common',
    skills: ['harvest', 'follow'],
    catchDifficulty: 0.3,
    speed: 0.27,
    bodyColor: 0xd9c9a8,
    bellyColor: 0xf0e6d2,
    scale: 1.0,
    body: 'long',
    ears: 'horn',
    model: 'caprity',
  },
  direhowl: {
    id: 'direhowl',
    name: 'Direhowl',
    rarity: 'uncommon',
    skills: ['gather', 'follow'],
    catchDifficulty: 0.5,
    speed: 0.45,
    bodyColor: 0x8b7a6a,
    bellyColor: 0xe0d6c8,
    scale: 0.95,
    body: 'long',
    ears: 'long',
    model: 'direhowl',
  },
  univolt: {
    id: 'univolt',
    name: 'Univolt',
    rarity: 'uncommon',
    skills: ['gather', 'harvest', 'follow'],
    catchDifficulty: 0.55,
    speed: 0.34,
    bodyColor: 0x4a5e8a,
    bellyColor: 0xf2f2f2,
    scale: 1.1,
    body: 'long',
    ears: 'horn',
    model: 'univolt',
  },
  lunaris: {
    id: 'lunaris',
    name: 'Lunaris',
    rarity: 'uncommon',
    skills: ['water', 'harvest', 'follow'],
    catchDifficulty: 0.5,
    speed: 0.6,
    bodyColor: 0xc8c0e8,
    bellyColor: 0xf4f0ff,
    scale: 0.95,
    body: 'tall',
    ears: 'none',
    model: 'lunaris',
  },
  katress: {
    id: 'katress',
    name: 'Katress',
    rarity: 'rare',
    skills: ['water', 'harvest', 'follow'],
    catchDifficulty: 0.7,
    speed: 0.45,
    bodyColor: 0x6b5a9e,
    bellyColor: 0xf0d8e8,
    scale: 0.95,
    body: 'tall',
    ears: 'long',
    model: 'katress',
  },
  mossanda: {
    id: 'mossanda',
    name: 'Mossanda',
    rarity: 'rare',
    skills: ['water', 'harvest', 'gather', 'follow'],
    catchDifficulty: 0.75,
    speed: 0.2,
    bodyColor: 0x5f8f5a,
    bellyColor: 0xe9e3c9,
    scale: 1.3,
    body: 'round',
    ears: 'none',
    model: 'mossanda',
  },
}

export const PET_IDS = Object.keys(PETS)

export function petDef(id: string): PetDef {
  const def = PETS[id]
  if (!def) throw new Error(`Unknown pet: ${id}`)
  return def
}

/** Bảng trọng số spawn theo độ hiếm. */
const SPAWN_WEIGHT: Record<PetDef['rarity'], number> = {
  common: 60,
  uncommon: 28,
  rare: 12,
}

export function rollWildPetId(rand: () => number): string {
  const entries = PET_IDS.map((id) => [id, SPAWN_WEIGHT[PETS[id]!.rarity]] as const)
  const total = entries.reduce((sum, [, w]) => sum + w, 0)
  let roll = rand() * total
  for (const [id, w] of entries) {
    roll -= w
    if (roll <= 0) return id
  }
  return PET_IDS[0]!
}

/** Tỉ lệ bắt thành công: dễ hơn khi pet mệt và khi bóng ném trúng gần. */
export function catchChance(def: PetDef, staminaRatio: number, distance: number): number {
  const base = 1 - def.catchDifficulty
  const tiredBonus = (1 - staminaRatio) * 0.35
  const rangePenalty = Math.min(0.3, Math.max(0, (distance - 2) * 0.06))
  return Math.max(0.05, Math.min(0.95, base + tiredBonus - rangePenalty))
}
