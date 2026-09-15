import * as THREE from 'three'

/** Màu mực. Nâu ấm chứ không phải đen — đen làm cảnh bị "in ấn", mất vẻ vẽ tay. */
export const INK = 0x4a3728

/**
 * Viền mực kiểu vẽ tay, dựng bằng thủ thuật "vỏ lộn ngược": vẽ lại vật thể một
 * lần nữa, phình ra dọc pháp tuyến và chỉ hiện mặt SAU. Phần phình ra lòi khỏi
 * bản gốc đúng một dải đều quanh bóng vật thể.
 *
 * Chọn cách này thay vì hậu kỳ dò biên vì nó cho nét dày đều tuyệt đối ở mọi
 * khoảng cách — giống nét bút của hoạ sĩ — trong khi dò biên theo depth/normal
 * cho nét mảnh dần khi vật ở xa và cần thêm hai lượt render toàn màn hình.
 */
function outlineMaterial(thickness: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uThickness: { value: thickness },
      uColor: { value: new THREE.Color(INK) },
    },
    // Viền nằm ngoài vật thể nên phải vẽ mặt sau, nếu không nó che mất chính nó.
    side: THREE.BackSide,
    // Không tự khai báo `instanceMatrix` hay `USE_INSTANCING`: three tự chèn cả
    // hai khi vật thể là InstancedMesh. Khai báo thêm sẽ trùng và shader không
    // biên dịch được. Cùng một material dùng được cho cả hai loại mesh.
    vertexShader: `
      uniform float uThickness;
      void main() {
        vec3 inflated = position + normalize(normal) * uThickness;
        #ifdef USE_INSTANCING
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(inflated, 1.0);
        #else
          vec4 mv = modelViewMatrix * vec4(inflated, 1.0);
        #endif
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }
    `,
  })
}

const cache = new Map<number, THREE.ShaderMaterial>()

function material(thickness: number): THREE.ShaderMaterial {
  let mat = cache.get(thickness)
  if (!mat) cache.set(thickness, (mat = outlineMaterial(thickness)))
  return mat
}

/**
 * Gắn viền cho mọi Mesh trong một cây đối tượng (nhân vật, pet).
 *
 * Viền được thêm làm CON của chính mesh đó với biến đổi đơn vị, nên nó tự đi
 * theo mọi phép xoay của khớp xương mà không cần đồng bộ gì thêm.
 */
export function addOutlines(root: THREE.Object3D, thickness = 0.018): void {
  const targets: THREE.Mesh[] = []
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return
    const mesh = obj as THREE.Mesh
    if (mesh.userData.isOutline) return
    // Bóng đổ giả dưới chân là mặt phẳng trong suốt, viền quanh nó sẽ thành
    // một khung chữ nhật đen lơ lửng.
    if (mesh.userData.noOutline) return
    targets.push(mesh)
  })

  for (const mesh of targets) {
    const shell = new THREE.Mesh(mesh.geometry, material(thickness))
    shell.userData.isOutline = true
    shell.castShadow = false
    shell.receiveShadow = false
    shell.renderOrder = (mesh.renderOrder ?? 0) - 1
    mesh.add(shell)
  }
}

/**
 * Viền cho InstancedMesh. Hai mesh DÙNG CHUNG instanceMatrix, nên chỉ cần cập
 * nhật ma trận ở bản gốc là viền tự khớp theo.
 */
export function makeInstancedOutline(
  source: THREE.InstancedMesh,
  thickness = 0.03,
): THREE.InstancedMesh {
  const shell = new THREE.InstancedMesh(
    source.geometry,
    material(thickness),
    source.count || 1,
  )
  shell.instanceMatrix = source.instanceMatrix
  shell.userData.isOutline = true
  shell.castShadow = false
  shell.receiveShadow = false
  shell.frustumCulled = false
  shell.renderOrder = -1
  return shell
}

export function disposeOutlines(): void {
  for (const mat of cache.values()) mat.dispose()
  cache.clear()
}
