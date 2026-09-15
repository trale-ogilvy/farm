import type { CropDef } from '../types'

/**
 * Chỉ giữ những cây có model 3D (asset pack + lúa mì). Thứ tự = thứ tự trong
 * cửa hàng và túi hạt: rẻ trước, đắt sau.
 */
export const CROPS: Record<string, CropDef> = {
  mushroom: {
    id: 'mushroom',
    name: 'Nấm',
    stages: 4,
    growMinutes: 2.5,
    seedPrice: 12,
    sellPrice: 30,
    colorLeaf: 0xb59a7a,
    colorFruit: 0xd9573f,
    shape: 'leafy',
    model: 'mushroom',
  },
  carrot: {
    id: 'carrot',
    name: 'Cà rốt',
    stages: 4,
    growMinutes: 3,
    seedPrice: 16,
    sellPrice: 48,
    colorLeaf: 0x4e9e2f,
    colorFruit: 0xf08a2c,
    shape: 'leafy',
    model: 'carrot',
  },
  wheat: {
    id: 'wheat',
    name: 'Lúa mì',
    stages: 4,
    growMinutes: 4,
    seedPrice: 20,
    sellPrice: 60,
    colorLeaf: 0x7fb54a,
    colorFruit: 0xd9b45a,
    shape: 'stalk',
    model: 'wheat1',
  },
  broccoli: {
    id: 'broccoli',
    name: 'Bông cải xanh',
    stages: 4,
    growMinutes: 4,
    seedPrice: 24,
    sellPrice: 70,
    colorLeaf: 0x4f9a3a,
    colorFruit: 0x3e8a2e,
    shape: 'leafy',
    model: 'broccoli',
  },
  cauliflower: {
    id: 'cauliflower',
    name: 'Súp lơ',
    stages: 4,
    growMinutes: 5,
    seedPrice: 35,
    sellPrice: 95,
    colorLeaf: 0x5aa043,
    colorFruit: 0xf3efe0,
    shape: 'leafy',
    model: 'cauliflower',
  },
  sunflower: {
    id: 'sunflower',
    name: 'Hướng dương',
    stages: 5,
    growMinutes: 7,
    seedPrice: 55,
    sellPrice: 150,
    colorLeaf: 0x5c9c3b,
    colorFruit: 0xf2c94c,
    shape: 'stalk',
    model: 'sunflower',
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
