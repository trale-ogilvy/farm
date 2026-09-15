<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

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
  ['F', 'Làm việc trước mặt — xem bong bóng trên mục tiêu'],
  ['1 – 6', 'Chọn dụng cụ ở dãy ô nhanh'],
  ['WASD / ←↑→↓', 'Di chuyển theo hướng camera'],
  ['Giữ chuột phải', 'Xoay camera quanh nhân vật'],
  ['Q / E', 'Xoay camera bằng bàn phím'],
  ['Cuộn chuột', 'Kéo camera xa / gần'],
  ['Shift', 'Chạy (tốn sức)'],
  ['Chuột trái / Space', 'Dùng dụng cụ đang cầm — trừ bóng, bóng chỉ ném bằng F'],
  ['B', 'Ba lô — kéo dụng cụ xuống ô nhanh'],
  ['R', 'Ăn nông sản để hồi sức'],
  ['Tab', 'Bảng pet'],
  ['Esc', 'Đóng bảng đang mở'],
]

const FLOW = [
  ['🅕', 'Đứng cạnh mục tiêu là hiện bong bóng — bấm F làm đúng việc đó'],
  ['🎒', 'Mỗi việc cần đúng dụng cụ: cầm sai thì không hiện bong bóng'],
  ['⛏️', 'Cầm cuốc (phím 1) rồi bấm F để mở luống mới'],
  ['🌱', 'Cầm túi hạt bấm F trên luống trống — chọn một loại là gieo kín ruộng'],
  ['🪣', 'Múc nước ở ao rồi tưới — cây khô lớn chậm 3 lần'],
  ['🌾', 'Thu hoạch khi cây đã chín'],
  ['🔴', 'Cầm bóng, đứng gần pet hoang tới khi hiện BẮT rồi bấm F'],
]
</script>

<template>
  <div class="absolute bottom-4 left-1/2 -translate-x-1/2">
    <button
      v-if="!open"
      class="panel grid h-10 w-10 place-items-center text-lg transition hover:bg-ink/8"
      title="Hướng dẫn"
      @click="open = true"
    >
      ?
    </button>

    <div v-else class="panel w-80 p-4 text-sm">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-bold uppercase tracking-widest">Cách chơi</h2>
        <button class="text-lg leading-none opacity-60 hover:opacity-100" @click="open = false">
          ✕
        </button>
      </div>

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
