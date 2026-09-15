<script setup lang="ts">
import { useGameStore } from '~/composables/useGameStore'
import type { JobKind } from '~/game/types'

const { engine, pets, panel } = useGameStore()

const JOB_LABEL: Record<JobKind, { icon: string; text: string }> = {
  idle: { icon: '💤', text: 'Nghỉ' },
  follow: { icon: '🐾', text: 'Theo chân' },
  water: { icon: '💧', text: 'Tưới cây' },
  harvest: { icon: '🌾', text: 'Thu hoạch' },
  gather: { icon: '🪵', text: 'Nhặt nhạnh' },
}

const STATE_LABEL: Record<string, string> = {
  wander: 'đi dạo',
  flee: 'bỏ chạy',
  seek: 'đang tới chỗ làm',
  work: 'đang làm',
  follow: 'theo bạn',
  rest: 'đang nghỉ',
  stunned: 'choáng',
}

/** Nghề nào pet này nhận được — dựa trên `skills` trong def. */
function jobsFor(skills: JobKind[]): JobKind[] {
  const base: JobKind[] = ['follow', 'idle']
  const work = (['water', 'harvest', 'gather'] as JobKind[]).filter((j) => skills.includes(j))
  return [...work, ...base]
}

function assign(uid: string, job: JobKind) {
  engine.value?.assignJob(uid, job)
}

function release(uid: string) {
  engine.value?.pets.release(uid)
}

function tint(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`
}
</script>

<template>
  <Transition name="panel">
    <aside
      v-if="panel === 'pets'"
      class="panel absolute right-3 top-3 flex max-h-[calc(100%-9rem)] w-80 flex-col"
    >
      <header class="flex items-center justify-between border-b border-ink/12 px-4 py-3">
        <h2 class="text-sm font-bold uppercase tracking-widest">
          Pet của bạn ({{ pets.length }})
        </h2>
        <button class="text-lg leading-none opacity-60 hover:opacity-100" @click="panel = 'none'">
          ✕
        </button>
      </header>

      <p v-if="!pets.length" class="px-4 py-8 text-center text-sm opacity-60">
        Chưa có pet nào.<br />Chọn bóng (phím <b>6</b>) rồi ném vào pet hoang.
      </p>

      <div v-else class="flex-1 overflow-y-auto px-2 py-2">
        <article
          v-for="pet in pets"
          :key="pet.uid"
          class="mb-2 inset-card p-3 last:mb-0"
        >
          <div class="flex items-center gap-2">
            <span
              class="h-6 w-6 shrink-0 rounded-md ring-1 ring-ink/20"
              :style="{ background: tint(pet.def.bodyColor) }"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline gap-2">
                <b class="truncate text-sm">{{ pet.name }}</b>
                <span class="text-[10px] uppercase tracking-wider opacity-50">
                  Lv{{ pet.level }} · {{ pet.def.rarity }}
                </span>
              </div>
              <div class="text-[11px] opacity-60">
                {{ STATE_LABEL[pet.state] ?? pet.state }}
              </div>
            </div>
            <button
              class="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider opacity-40 transition hover:bg-[#c05a4a]/25 hover:opacity-100"
              title="Thả về tự nhiên"
              @click="release(pet.uid)"
            >
              thả
            </button>
          </div>

          <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/12">
            <div
              class="h-full rounded-full bg-clay transition-[width] duration-300"
              :style="{ width: `${(pet.stamina / pet.maxStamina) * 100}%` }"
            />
          </div>

          <div class="mt-2 flex flex-wrap gap-1">
            <button
              v-for="job in jobsFor(pet.def.skills)"
              :key="job"
              class="rounded px-2 py-1 text-[11px] transition"
              :class="
                pet.job === job
                  ? 'bg-sage/40 ring-1 ring-sage'
                  : 'bg-ink/5 hover:bg-ink/12'
              "
              @click="assign(pet.uid, job)"
            >
              {{ JOB_LABEL[job].icon }} {{ JOB_LABEL[job].text }}
            </button>
          </div>
        </article>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateX(12px);
}
</style>
