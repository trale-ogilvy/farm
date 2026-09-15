import type { ToolKind } from '../types'
import { CROPS } from './crops'

/**
 * Danh mục vật phẩm — dùng để chia tab trong ba lô.
 *
 * `tool` không nằm trong `inventory`: dụng cụ thì người chơi luôn có đủ bộ,
 * chỉ có bóng bắt pet là vừa là dụng cụ vừa đếm được. Ba lô tự ghép hai nguồn
 * đó lại nên lớp UI không phải biết chuyện này.
 */
export type ItemCategory = 'tool' | 'seed' | 'crop' | 'material'

export interface ItemInfo {
  id: string
  name: string
  icon: string
  category: ItemCategory
}

/**
 * `needsTool` = phải đang cầm thứ này thì việc mới hiện ra.
 *
 * Túi hạt và liềm thì không: gieo với hái là việc của bàn tay, tới gần là làm
 * được. Chúng vẫn nằm trong danh sách vì nhân vật rút chúng ra trong animation,
 * và vì cầm sẵn trên tay cũng là một cách chơi.
 */
export const TOOL_INFO: Record<
  ToolKind,
  { name: string; icon: string; hint: string; needsTool: boolean }
> = {
  hoe: { name: 'Cuốc', icon: '⛏️', hint: 'Mở luống trên cỏ', needsTool: true },
  wateringCan: {
    name: 'Bình tưới',
    icon: '🪣',
    hint: 'Tưới cây, múc nước ở ao',
    needsTool: true,
  },
  seedBag: {
    name: 'Túi hạt',
    icon: '🌱',
    hint: 'Gieo hạt xuống luống trống',
    needsTool: false,
  },
  scythe: {
    name: 'Liềm',
    icon: '🌾',
    hint: 'Thu hoạch cây đã chín',
    needsTool: false,
  },
  axe: { name: 'Rìu', icon: '🪓', hint: 'Chặt cây, đập đá', needsTool: true },
  ball: { name: 'Bóng bắt pet', icon: '🔴', hint: 'Ném vào pet hoang', needsTool: true },
}

export const TOOL_IDS = Object.keys(TOOL_INFO) as ToolKind[]

const CROP_ICONS: Record<string, string> = {
  turnip: '🥬',
  carrot: '🥕',
  tomato: '🍅',
  corn: '🌽',
  pumpkin: '🎃',
}

const MATERIALS: Record<string, { name: string; icon: string }> = {
  wood: { name: 'Gỗ', icon: '🪵' },
  fiber: { name: 'Sợi', icon: '🌿' },
  stone: { name: 'Đá', icon: '🪨' },
}

export function isTool(id: string): id is ToolKind {
  return id in TOOL_INFO
}

export function cropIcon(id: string): string {
  return CROP_ICONS[id] ?? '🌿'
}

/** Tên + biểu tượng + nhóm của một id trong túi đồ. */
export function itemInfo(id: string): ItemInfo {
  if (id.startsWith('seed:')) {
    const crop = CROPS[id.slice(5)]
    return {
      id,
      name: `Hạt ${crop?.name ?? id.slice(5)}`,
      icon: '🌱',
      category: 'seed',
    }
  }
  if (CROPS[id]) {
    return { id, name: CROPS[id]!.name, icon: cropIcon(id), category: 'crop' }
  }
  if (isTool(id)) {
    const t = TOOL_INFO[id]
    return { id, name: t.name, icon: t.icon, category: 'tool' }
  }
  const mat = MATERIALS[id]
  return { id, name: mat?.name ?? id, icon: mat?.icon ?? '📦', category: 'material' }
}
