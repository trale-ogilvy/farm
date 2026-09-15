import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeSimple, paint } from '../TerrainMesh'

/**
 * Đưa model glTF tải từ ngoài vào cùng đường ống với geometry dựng bằng tay.
 *
 * Renderer chỉ biết một thứ: BufferGeometry có màu nướng vào vertex, vẽ bằng
 * `toonVertexColors()` và instancing. Vậy nên model ngoài cũng được ép về đúng
 * dạng đó — bỏ material PBR, bỏ UV, bỏ cây node — thay vì thêm một nhánh
 * "mesh có texture" vào SceneManager. Bù lại, mọi model đều tự động có viền
 * mực, tô màu phẳng và highlight như phần còn lại của cảnh.
 */

/** Một mesh trong file: geometry ở toạ độ thế giới của file + texture màu (nếu có). */
export interface GltfPart {
  geometry: THREE.BufferGeometry
  /** Texture màu của material, dùng để nướng màu theo UV. */
  map: THREE.Texture | null
  /** Màu phẳng của material, dùng khi không có texture. */
  color: number
}

/** Các mesh trong file theo tên node (GLTFLoader đã bỏ dấu chấm trong tên). */
export type GltfParts = Map<string, GltfPart>

const loader = new GLTFLoader()
const cache = new Map<string, Promise<GltfParts>>()

/**
 * Tải file và trả về từng mesh theo tên node, ở toạ độ thế giới của file.
 *
 * Model từ Sketchfab hay lồng nhiều tầng node xoay/phóng (đổi trục Z-up,
 * đơn vị cm→m...). Áp thẳng `matrixWorld` vào geometry để phần sau không phải
 * quan tâm chuyện đó nữa.
 */
export function loadGltfParts(url: string): Promise<GltfParts> {
  let hit = cache.get(url)
  if (hit) return hit

  hit = loader.loadAsync(url).then((gltf) => {
    gltf.scene.updateMatrixWorld(true)
    const parts: GltfParts = new Map()
    gltf.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const geometry = mesh.geometry.clone()
      geometry.applyMatrix4(mesh.matrixWorld)
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
        | THREE.MeshStandardMaterial
        | undefined
      parts.set(mesh.name, {
        geometry,
        map: mat?.map ?? null,
        color: mat?.color?.getHex() ?? 0xffffff,
      })
    })
    return parts
  })
  cache.set(url, hit)
  return hit
}

/** Điểm ảnh của texture đã đọc ra RAM, cache theo texture để sample nhiều mesh. */
const pixelCache = new WeakMap<THREE.Texture, ImageData>()

function readPixels(tex: THREE.Texture): ImageData | null {
  const hit = pixelCache.get(tex)
  if (hit) return hit
  const img = tex.image as CanvasImageSource & { width: number; height: number }
  if (!img?.width || !img?.height) return null
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, img.width, img.height)
  pixelCache.set(tex, data)
  return data
}

/**
 * Nướng màu từ texture vào vertex color theo UV.
 *
 * Asset pack low-poly hay tô màu bằng một "palette texture": mỗi mặt trỏ UV
 * vào một ô màu phẳng. Sample tại vertex là đủ, không mất gì so với vẽ bằng
 * texture thật — mà lại chạy chung material với phần còn lại của cảnh.
 */
function paintFromTexture(geo: THREE.BufferGeometry, tex: THREE.Texture, fallback: number): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv')
  const pixels = readPixels(tex)
  if (!uv || !pixels) return paint(geo, fallback)

  const { width, height, data } = pixels
  const count = geo.getAttribute('position').count
  const out = new Float32Array(count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < count; i++) {
    // GLTFLoader để flipY = false: gốc UV ở góc trên-trái, khớp thẳng với ảnh.
    const u = uv.getX(i) - Math.floor(uv.getX(i))
    const v = uv.getY(i) - Math.floor(uv.getY(i))
    const px = Math.min(width - 1, Math.floor(u * width))
    const py = Math.min(height - 1, Math.floor(v * height))
    const k = (py * width + px) * 4
    c.setRGB(data[k]! / 255, data[k + 1]! / 255, data[k + 2]! / 255, THREE.SRGBColorSpace)
    soften(c)
    out[i * 3] = c.r
    out[i * 3 + 1] = c.g
    out[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(out, 3))
  return geo
}

const hsl = { h: 0, s: 0, l: 0 }

/**
 * Kéo màu của asset pack về bảng pastel của cảnh: bớt bão hoà, nâng nhẹ độ
 * sáng. Asset pack tô màu nguyên chất (cam #ff6a00, xanh lá chanh) rất chói
 * cạnh địa hình pha xám của game; làm dịu ở bước nướng thì mọi model đều tự
 * khớp mà không phải sửa texture gốc.
 */
function soften(c: THREE.Color): void {
  c.getHSL(hsl)
  c.setHSL(hsl.h, hsl.s * 0.75, hsl.l + (0.62 - hsl.l) * 0.12)
}

/**
 * Gộp một mesh về dạng không index chỉ có position/normal/color, căn giữa
 * theo x/z rồi nhân với `scale`.
 *
 * - `color` có thì tô phẳng màu đó, không thì lấy màu từ texture của model.
 * - Trục y giữ nguyên như tác giả đặt (y = 0 là mặt đất, rễ được phép âm);
 *   chỉ hạ xuống khi cả model lơ lửng trên 0.
 * - Tỉ lệ được truyền vào chứ không tự tính từ hộp bao của chính mesh: các
 *   giai đoạn của cùng một cây phải dùng chung một tỉ lệ, nếu không cây non và
 *   cây chín sẽ bị kéo về cùng cỡ và mất luôn cảm giác đang lớn.
 */
export function bakePart(
  part: GltfPart,
  scale: number,
  color?: number,
  opts: { outline?: boolean } = {},
): THREE.BufferGeometry {
  const geo = part.geometry.clone()
  geo.computeBoundingBox()
  const box = geo.boundingBox!
  geo.translate(-(box.min.x + box.max.x) / 2, box.min.y > 0 ? -box.min.y : 0, -(box.min.z + box.max.z) / 2)
  geo.scale(scale, scale, scale)

  const painted =
    color !== undefined || !part.map ? paint(geo, color ?? part.color) : paintFromTexture(geo, part.map, part.color)
  // Model ngoài thường dùng normal mượt; toon 2 bậc cần normal phẳng theo mặt
  // thì mảng sáng/tối mới ra hình khối, nếu không bề mặt bị loang lổ.
  const flat = painted.index ? painted.toNonIndexed() : painted
  flat.computeVertexNormals()
  const merged = mergeSimple([flat])
  if (opts.outline === false) merged.userData.noOutline = true
  return merged
}

/** Bề ngang lớn nhất (theo x hoặc z) của một mesh, để tính tỉ lệ vừa ô. */
export function footprint(part: GltfPart): number {
  part.geometry.computeBoundingBox()
  const box = part.geometry.boundingBox!
  return Math.max(box.max.x - box.min.x, box.max.z - box.min.z)
}
