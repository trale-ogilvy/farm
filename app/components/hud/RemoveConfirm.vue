<script setup lang="ts">
import { useGameStore } from '~/composables/useGameStore'
import { BUILDINGS } from '~/game/data/buildings'

const { engine, removeConfirm } = useGameStore()

function confirm() {
  const req = removeConfirm.value
  removeConfirm.value = null
  if (req) engine.value?.removeBuilding(req.x, req.z)
}
</script>

<template>
  <!-- Lớp phủ nhận mọi cú bấm ngoài hộp thoại và coi đó là "thôi". -->
  <div
    v-if="removeConfirm"
    class="absolute inset-0 grid place-items-center bg-ink/20"
    @click.self="removeConfirm = null"
  >
    <div class="panel w-80 p-5">
      <h2 class="mb-1 text-sm font-bold uppercase tracking-widest">
        Dỡ {{ BUILDINGS[removeConfirm.kind].name }}?
      </h2>
      <p class="mb-4 text-[13px] leading-snug opacity-75">
        Ô này sẽ trở lại thành đất trống.
        <template v-if="removeConfirm.hasCrop">
          <b>Cây đang trồng trên đó sẽ mất.</b>
        </template>
        Công sức đã xây không lấy lại được.
      </p>
      <div class="flex justify-end gap-2">
        <button
          class="rounded-md px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider hover:bg-ink/8"
          @click="removeConfirm = null"
        >
          Thôi (Esc)
        </button>
        <button
          class="rounded-md bg-[#c4452f] px-3 py-1.5 text-[12px] font-bold uppercase tracking-wider text-paper hover:brightness-110"
          @click="confirm"
        >
          Dỡ bỏ
        </button>
      </div>
    </div>
  </div>
</template>
