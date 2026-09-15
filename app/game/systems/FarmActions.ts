import type { EventBus } from '../core/EventBus'
import type { Grid } from '../world/Grid'
import type { Player } from '../entities/Player'
import type { Tile, ToolKind } from '../types'
import { cropDef, isHarvestable } from '../data/crops'
import { WET_DURATION } from './CropSystem'

export interface ActionResult {
  ok: boolean
  reason?: string
}

/**
 * Toàn bộ luật "dùng dụng cụ X lên ô Y". Tách riêng khỏi Player để sau này pet
 * (và người chơi khác khi có multiplayer) dùng lại đúng cùng bộ luật.
 */
export class FarmActions {
  constructor(
    private grid: Grid,
    private bus: EventBus,
  ) {}

  perform(tool: ToolKind, x: number, z: number, player: Player): ActionResult {
    const tile = this.grid.at(x, z)
    if (!tile) return fail('Ngoài bản đồ')

    switch (tool) {
      case 'wateringCan':
        return this.water(tile, player)
      case 'seedBag':
        return this.plant(tile, player)
      case 'scythe':
        return this.harvest(tile, player)
      case 'axe':
        return this.chop(tile, player)
      default:
        return fail('Dụng cụ này không dùng được ở đây')
    }
  }

  /** Bình tưới không bao giờ cạn: tưới là việc tốn thời gian, không tốn tài nguyên. */
  private water(tile: Tile, _player: Player): ActionResult {
    if (!tile.tilled) return fail('Chỉ tưới được luống đất')

    tile.wetUntil = Math.max(tile.wetUntil, this.now + WET_DURATION)
    this.touch(tile)
    this.bus.emit('player:changed', undefined)
    return { ok: true }
  }

  private plant(tile: Tile, player: Player): ActionResult {
    if (!tile.tilled) return fail('Phải cuốc đất trước')
    if (tile.crop) return fail('Ô này đã có cây')

    const seedId = player.state.selectedSeed
    const item = player.state.inventory.find((i) => i.id === `seed:${seedId}`)
    if (!item || item.count <= 0) return fail(`Hết hạt ${cropDef(seedId).name}`)

    item.count -= 1
    tile.crop = { typeId: seedId, growth: 0, stage: 0 }
    this.touch(tile)
    this.bus.emit('player:changed', undefined)
    return { ok: true }
  }

  private harvest(tile: Tile, player: Player): ActionResult {
    if (!tile.crop) return fail('Không có gì để thu')
    const def = cropDef(tile.crop.typeId)

    if (!isHarvestable(def, tile.crop)) {
      // Nhổ cây non thì mất trắng — cảnh báo qua toast rồi vẫn cho nhổ.
      tile.crop = null
      this.touch(tile)
      this.bus.emit('toast', { text: `Đã nhổ bỏ ${def.name} non`, kind: 'bad' })
      return { ok: true }
    }


    addItem(player, def.id, 1)
    if (def.regrow > 0) {
      // Cây ra quả tiếp: lùi tiến độ về 60% thay vì xoá cây.
      tile.crop.growth *= 0.6
      tile.crop.stage = Math.max(1, tile.crop.stage - 1)
    } else {
      tile.crop = null
    }
    this.touch(tile)
    this.bus.emit('player:changed', undefined)
    this.bus.emit('toast', { text: `+1 ${def.name}`, kind: 'good' })
    return { ok: true }
  }

  private chop(tile: Tile, player: Player): ActionResult {
    if (!tile.prop) return fail('Không có gì để chặt')
    if (tile.propHp >= 999) return fail('Cây này quá lớn')

    tile.propHp -= 1
    if (tile.propHp > 0) {
      this.touch(tile)
      return { ok: true }
    }

    const drops: Record<string, [string, number]> = {
      tree: ['wood', 3],
      bush: ['fiber', 2],
      rock: ['stone', 2],
      stump: ['wood', 1],
    }
    const [item, qty] = drops[tile.prop] ?? ['wood', 1]
    addItem(player, item, qty)

    // Chặt cây để lại gốc, đập một nhát nữa mới sạch hẳn.
    if (tile.prop === 'tree') {
      tile.prop = 'stump'
      tile.propHp = 1
    } else {
      tile.prop = null
      tile.propHp = 0
    }
    this.touch(tile)
    this.bus.emit('player:changed', undefined)
    this.bus.emit('toast', { text: `+${qty} ${item}`, kind: 'good' })
    return { ok: true }
  }

  /** Game-time hiện tại, do Engine bơm vào trước mỗi lần gọi. */
  now = 0

  private touch(tile: Tile): void {
    this.grid.markDirty(tile.x, tile.z)
    this.bus.emit('tile:changed', { x: tile.x, z: tile.z })
  }
}

export function addItem(player: Player, id: string, count: number): void {
  const existing = player.state.inventory.find((i) => i.id === id)
  if (existing) existing.count += count
  else player.state.inventory.push({ id, count })
}

function fail(reason: string): ActionResult {
  return { ok: false, reason }
}
