import type { PetDef } from '../types'

/**
 * Pet được dựng hoàn toàn bằng code (không cần file model), nên mỗi def chỉ là
 * vài tham số hình dáng + màu. Muốn thêm loài mới chỉ cần thêm một entry.
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
