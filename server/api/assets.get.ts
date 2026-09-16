import { readdir, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

export interface AssetEntry {
  /** URL tương đối từ `/models/`, ví dụ `farmkit/GLTF/Prop/Props_Crate_01.glb`. */
  path: string
  /** Thư mục gốc — mỗi asset pack một thư mục. */
  pack: string
  /** Thư mục con trong pack, để gom nhóm trong danh sách. */
  group: string
  name: string
  bytes: number
}

const ROOT = join(process.cwd(), 'public', 'models')

/**
 * Quét `public/models` lấy mọi file glTF. Chỉ phục vụ trang xem asset lúc dev;
 * đọc thẳng đĩa mỗi lần gọi để thêm pack mới là thấy ngay, không cần build.
 */
async function walk(dir: string, out: AssetEntry[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(full, out)
      continue
    }
    if (!/\.(glb|gltf)$/i.test(entry.name)) continue
    const rel = relative(ROOT, full).split(sep)
    const { size } = await stat(full)
    out.push({
      path: rel.join('/'),
      pack: rel[0]!,
      group: rel.slice(1, -1).join('/'),
      name: entry.name.replace(/\.(glb|gltf)$/i, ''),
      bytes: size,
    })
  }
}

export default defineEventHandler(async () => {
  const files: AssetEntry[] = []
  await walk(ROOT, files)
  files.sort((a, b) => a.path.localeCompare(b.path))
  return files
})
