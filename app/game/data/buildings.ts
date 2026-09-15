import type { BuildingKind } from '../types'

export interface BuildingDef {
  id: BuildingKind
  name: string
  icon: string
  desc: string
  /**
   * Khối lượng công việc để xây xong. Người chơi có `work` = 10 mặc định, tức
   * mỗi giây đứng xây trừ đi 10; luống đất 20 nghĩa là hai giây.
   */
  workload: number
  /** Dỡ được bằng dụng cụ 🗑️ không. Nhà chính chẳng hạn thì không. */
  removable: boolean
}

/**
 * Danh mục công trình. Mới chỉ có luống đất; mọi thứ về sau (hàng rào, chuồng,
 * kho) đi cùng cơ chế: đặt xuống → tới gần bấm F → đứng làm tới khi đủ workload.
 */
export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  cropPlot: {
    id: 'cropPlot',
    name: 'Luống đất',
    icon: '🟫',
    desc: 'Đất đã xới, gieo hạt lên được',
    workload: 20,
    removable: true,
  },
}

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingKind[]

export function buildingDef(id: BuildingKind): BuildingDef {
  return BUILDINGS[id]
}
