import type { CropDef } from '../types'

export const CROPS: Record<string, CropDef> = {
  turnip: {
    id: 'turnip',
    name: 'Củ cải',
    stages: 4,
    growMinutes: 2,
    seedPrice: 10,
    sellPrice: 28,
    regrow: 0,
    colorLeaf: 0x5fa832,
    colorFruit: 0xf2f0e6,
    shape: 'leafy',
  },
  carrot: {
    id: 'carrot',
    name: 'Cà rốt',
    stages: 4,
    growMinutes: 3,
    seedPrice: 16,
    sellPrice: 48,
    regrow: 0,
    colorLeaf: 0x4e9e2f,
    colorFruit: 0xf08a2c,
    shape: 'leafy',
  },
  tomato: {
    id: 'tomato',
    name: 'Cà chua',
    stages: 5,
    growMinutes: 5,
    seedPrice: 30,
    sellPrice: 55,
    regrow: 3,
    colorLeaf: 0x3f8c2a,
    colorFruit: 0xe0362b,
    shape: 'vine',
  },
  corn: {
    id: 'corn',
    name: 'Ngô',
    stages: 5,
    growMinutes: 6,
    seedPrice: 40,
    sellPrice: 78,
    regrow: 2,
    colorLeaf: 0x6cad33,
    colorFruit: 0xf5d442,
    shape: 'stalk',
  },
  pumpkin: {
    id: 'pumpkin',
    name: 'Bí ngô',
    stages: 5,
    growMinutes: 9,
    seedPrice: 70,
    sellPrice: 220,
    regrow: 0,
    colorLeaf: 0x4a8f2b,
    colorFruit: 0xe07b12,
    shape: 'vine',
  },
}

export const CROP_IDS = Object.keys(CROPS)

export function cropDef(id: string): CropDef {
  const def = CROPS[id]
  if (!def) throw new Error(`Unknown crop: ${id}`)
  return def
}

/** Tổng thời gian lớn của cây, quy đổi ra mili-giây. */
export function cropGrowMs(def: CropDef): number {
  return def.growMinutes * 60_000
}

/** Giai đoạn (0..stages-1) suy ra từ tiến độ đã tích luỹ. */
export function cropStage(def: CropDef, growth: number): number {
  const total = cropGrowMs(def)
  const ratio = Math.min(1, growth / total)
  return Math.min(def.stages - 1, Math.floor(ratio * def.stages))
}

export function isHarvestable(def: CropDef, crop: { growth: number }): boolean {
  return crop.growth >= cropGrowMs(def)
}
