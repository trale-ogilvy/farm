import * as THREE from 'three'

/**
 * Hộp bo góc.
 *
 * Cách làm: chia nhỏ một BoxGeometry, rồi với mỗi đỉnh, kẹp nó vào "hộp lõi"
 * (hộp gốc co vào đúng bán kính bo) và đẩy ra ngoài theo hướng chênh lệch.
 * Đỉnh nằm giữa mặt phẳng không xê dịch, đỉnh ở cạnh và góc thì cong ra.
 *
 * Pháp tuyến lấy luôn bằng hướng đẩy đó — đúng về mặt toán học ở mọi vùng, nên
 * không cần hàn đỉnh trùng rồi computeVertexNormals (vốn sẽ để lại nếp gãy ở
 * ranh giới giữa các mặt của BoxGeometry).
 */
export function roundedBox(
  width: number,
  height: number,
  depth: number,
  radius: number,
  segments = 3,
): THREE.BufferGeometry {
  const r = Math.min(radius, width / 2, height / 2, depth / 2)
  const geo = new THREE.BoxGeometry(width, height, depth, segments, segments, segments)

  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute

  const ix = width / 2 - r
  const iy = height / 2 - r
  const iz = depth / 2 - r

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)

    const cx = clamp(x, -ix, ix)
    const cy = clamp(y, -iy, iy)
    const cz = clamp(z, -iz, iz)

    let dx = x - cx
    let dy = y - cy
    let dz = z - cz
    const len = Math.hypot(dx, dy, dz)
    if (len < 1e-6) continue

    dx /= len
    dy /= len
    dz /= len

    pos.setXYZ(i, cx + dx * r, cy + dy * r, cz + dz * r)
    nrm.setXYZ(i, dx, dy, dz)
  }

  pos.needsUpdate = true
  nrm.needsUpdate = true
  geo.computeBoundingSphere()
  return geo
}

/** Khối cầu dẹt dùng làm thân/tán lá tròn trịa. */
export function blob(radius: number, squashY = 1, detail = 1): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, detail)
  geo.scale(1, squashY, 1)
  return geo
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
