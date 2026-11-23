<script setup lang="ts">
import { onBeforeUnmount, onMounted, useModuleT } from '#imports'

defineOptions({ name: 'ShiftPassFullscreen' })

// The QR pass full screen, black on white at the largest size, so a lead can scan it from a bit away or in a dark bar.
// While it is open the screen is kept awake (the Screen Wake Lock API, where the browser has it; client-only). The
// lead on duty is shown with it.
defineProps<{ qr: string, code?: string | null, title: string, leads: string[] }>()
const emit = defineEmits<{ close: [] }>()

const t = useModuleT('shifts')

type WakeLock = { release: () => Promise<void> }
let lock: WakeLock | null = null
async function acquire() {
  try {
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLock> } }).wakeLock
    lock = (await wakeLock?.request('screen')) ?? null
  }
  catch {
    // Not allowed (low battery, a background tab): the pass still shows, the screen may dim.
    lock = null
  }
}
// The browser drops the lock when the tab is hidden: take it again when it is back.
const onVisible = () => {
  if (document.visibilityState === 'visible') void acquire()
}
const onKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') emit('close')
}
onMounted(() => {
  void acquire()
  document.addEventListener('visibilitychange', onVisible)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisible)
  document.removeEventListener('keydown', onKey)
  void lock?.release().catch(() => {})
})
</script>

<template>
  <div
    class="fixed inset-0 z-[100] flex flex-col items-center justify-between gap-4 bg-white p-4 text-black"
    role="dialog"
    aria-modal="true"
    :aria-label="t('shift.passLarge', 'Check-in pass, large')"
  >
    <div class="flex w-full items-start justify-between gap-2">
      <p class="text-lg font-semibold">
        {{ title }}
      </p>
      <UButton
        color="neutral"
        variant="solid"
        icon="i-lucide-x"
        :label="t('shift.passClose', 'Close')"
        @click="emit('close')"
      />
    </div>
    <img
      :src="qr"
      :alt="t('shift.passAlt', 'QR code to check in')"
      class="aspect-square w-[min(92vw,62vh)] max-w-full bg-white"
    >
    <div class="flex flex-col items-center gap-1 text-center">
      <p
        v-if="code"
        class="font-mono text-xs break-all text-neutral-600"
      >
        {{ code }}
      </p>
      <p
        v-if="leads.length"
        class="text-base"
      >
        {{ t('shift.leadOnDutyIs', 'Lead on duty: {names}', { names: leads.join(', ') }) }}
      </p>
    </div>
  </div>
</template>
