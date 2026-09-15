<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useGameStore } from '~/composables/useGameStore'

const { panel } = useGameStore()

const DISMISS_KEY = 'farm:help-dismissed'
const open = ref(true)

onMounted(() => {
  // Người chơi cũ không phải đóng lại bảng này mỗi lần vào game.
  try {
    open.value = localStorage.getItem(DISMISS_KEY) !== '1'
  } catch {
    /* trình duyệt chặn storage thì cứ mở mặc định */
  }
})

watch(open, (v) => {
  try {
    localStorage.setItem(DISMISS_KEY, v ? '0' : '1')
  } catch {
    /* bỏ qua */
  }
})

const ROWS = [
  ['Chuột trái', 'Dùng dụng cụ đang cầm lên thứ dưới con trỏ'],
  ['1 – 6', 'Cầm dụng cụ ở cột ô nhanh — bấm lại để buông ra'],
  ['F', 'Xây công trình đã đặt khi đứng cạnh nó'],
  ['WASD / ←↑→↓', 'Di chuyển theo hướng camera'],
  ['Giữ chuột phải', 'Xoay camera quanh nhân vật'],
  ['Q / E', 'Xoay camera bằng bàn phím'],
  ['Cuộn chuột', 'Kéo camera xa / gần'],
  ['Shift', 'Chạy'],
  ['B', 'Bảng xây dựng — chọn công trình rồi đặt xuống đất'],
  ['I', 'Ba lô — kéo dụng cụ sang cột ô nhanh'],
  ['Tab', 'Bảng pet'],
  ['Esc', 'Đóng bảng đang mở'],
]

const FLOW = [
  ['🖱️', 'Chọn dụng cụ trước, rồi bấm vào thứ cần làm — rê chuột qua là nó sáng lên'],
  ['🟡', 'Sáng vàng: bấm được. Sáng đỏ: đúng thứ đó nhưng xa quá, lại gần hơn'],
  ['🌾', 'Liềm lên cây chín, rìu lên cây / đá, bình nước lên cây khô'],
  ['✖', 'Ô cuối là dụng cụ dỡ bỏ: bấm vào luống hoặc bãi đang xây để dỡ (có hỏi lại)'],
  ['🔨', 'Bấm B, chọn Luống đất, đặt vào vòng tròn quanh nhà, tới gần bấm F để xây'],
  ['🌱', 'Cầm túi hạt bấm vào luống trống — chọn một loại là gieo kín ruộng'],
  ['🪣', 'Bình tưới không bao giờ cạn — cây khô lớn chậm 3 lần'],
  ['🔴', 'Cầm bóng bấm vào pet hoang trong tầm để bắt'],
]
</script>

<template>
  <!--
    Nấp đi khi có bảng lớn đang mở: chỗ này nằm giữa mép dưới, chồng đúng lên
    mấy hàng dưới của ba lô và nuốt mất cú bấm.
  -->
  <template v-if="panel === 'none'">
    <button
      v-if="!open"
      class="panel absolute bottom-4 left-1/2 grid h-10 w-10 -translate-x-1/2 place-items-center text-lg transition hover:bg-ink/8"
      title="Hướng dẫn"
      @click="open = true"
    >
      ?
    </button>

    <!--
      Mở ra thì căn GIỮA MÀN HÌNH và chặn trần chiều cao, không neo mép dưới.
      Neo mép dưới thì bảng dài thêm một dòng là mọc ngược lên quá đỉnh màn
      hình, kéo luôn cả nút ✕ ra ngoài — lúc đó không còn cách nào đóng nó.
    -->
    <div
      v-else
      class="panel absolute left-1/2 top-1/2 flex max-h-[calc(100%-4rem)] w-80 -translate-x-1/2 -translate-y-1/2 flex-col text-sm"
    >
      <div class="flex shrink-0 items-center justify-between px-4 pb-2 pt-4">
        <h2 class="text-sm font-bold uppercase tracking-widest">Cách chơi</h2>
        <button
          class="text-lg leading-none opacity-60 hover:opacity-100"
          title="Đóng"
          @click="open = false"
        >
          ✕
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <ol class="mb-3 space-y-1.5 border-b border-ink/12 pb-3">
          <li v-for="([icon, text], i) in FLOW" :key="i" class="flex gap-2 text-[13px]">
            <span class="w-5 shrink-0 text-center">{{ icon }}</span>
            <span class="opacity-85">{{ text }}</span>
          </li>
        </ol>

        <dl class="space-y-1">
          <div v-for="([key, desc]) in ROWS" :key="key" class="flex gap-3 text-[12px]">
            <dt class="w-32 shrink-0 font-mono opacity-60">{{ key }}</dt>
            <dd class="opacity-85">{{ desc }}</dd>
          </div>
        </dl>
      </div>
    </div>
  </template>
</template>
