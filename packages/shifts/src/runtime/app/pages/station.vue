<script setup lang="ts">
import { shiftsApi } from '../../utils/api'
import type { ShiftStationTokenDto } from '../../../types'
import { computed, errorMessage, navigateTo, onBeforeUnmount, onMounted, useAuthPages, useFetch, useHead, useModuleT, useRoute, useShiftsLinks, useShiftsTranslate, watch } from '#imports'

defineOptions({ name: 'ShiftsStationPage' })

// A check-in station's screen: its QR code full screen, black on white, a new one every 30 seconds (the page asks for
// the next token when the window turns). Volunteers of the team scan it from their shift page. For the team's leads and
// staff; the screen is kept awake (the Screen Wake Lock API, where the browser has it).
const t = useModuleT('shifts')
const tr = useShiftsTranslate()
const links = useShiftsLinks()
const route = useRoute()
const stationId = computed(() => String(route.params.stationId ?? ''))

const { data, error, refresh } = await useFetch<ShiftStationTokenDto>(() => shiftsApi.stationToken(stationId.value), {
  key: computed(() => `shifts:station:${stationId.value}`),
  server: false,
})
watch(error, async (value) => {
  if (value?.statusCode === 401) await navigateTo({ path: useAuthPages().login, query: { redirect: route.path } })
}, { immediate: true })
const qr = computed(() => data.value ? `data:image/svg+xml;utf8,${encodeURIComponent(data.value.svg)}` : null)

// Ask for the next token just after the window turns; on a failure (a dropped network) try again shortly.
let timer: ReturnType<typeof setTimeout> | undefined
function schedule() {
  clearTimeout(timer)
  const next = data.value ? Date.parse(data.value.refreshAt) - Date.now() + 250 : 5000
  timer = setTimeout(async () => {
    await refresh()
    schedule()
  }, Math.min(Math.max(next, 1000), 30_000))
}

type WakeLock = { release: () => Promise<void> }
let lock: WakeLock | null = null
async function acquire() {
  try {
    lock = (await (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLock> } }).wakeLock?.request('screen')) ?? null
  }
  catch {
    lock = null
  }
}
const onVisible = () => {
  if (document.visibilityState !== 'visible') return
  void acquire()
  void refresh().then(schedule)
}
onMounted(() => {
  schedule()
  void acquire()
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  document.removeEventListener('visibilitychange', onVisible)
  void lock?.release().catch(() => {})
})

useHead({ title: () => data.value ? tr(data.value.station.name) : t('station.title', 'Check-in station') })
</script>

<template>
  <div class="fixed inset-0 z-[100] flex flex-col items-center justify-between gap-4 bg-white p-4 text-black">
    <div class="flex w-full items-start justify-between gap-2">
      <div>
        <p class="text-2xl font-semibold">
          {{ data ? tr(data.station.name) : t('station.title', 'Check-in station') }}
        </p>
        <p
          v-if="data"
          class="text-lg text-neutral-600"
        >
          {{ tr(data.station.teamName) }}
        </p>
      </div>
      <UButton
        :to="links.shifts()"
        color="neutral"
        variant="solid"
        icon="i-lucide-x"
        :label="t('station.close', 'Close station')"
      />
    </div>
    <img
      v-if="qr"
      :src="qr"
      :alt="t('station.qrAlt', 'QR code to check in at this station')"
      class="aspect-square w-[min(92vw,70vh)] max-w-full bg-white"
    >
    <div
      v-else-if="error && error.statusCode !== 401"
      class="flex max-w-md flex-col items-center gap-2 text-center"
    >
      <p class="text-xl font-semibold">
        {{ error.statusCode === 403 ? t('station.forbidden', 'Only leads of the team can open this station') : error.statusCode === 404 ? t('station.notFound', 'This station does not exist') : t('station.loadFailed', 'The station could not be loaded') }}
      </p>
      <p
        v-if="error.statusCode !== 403 && error.statusCode !== 404"
        class="text-neutral-600"
      >
        {{ errorMessage(error, '') }}
      </p>
    </div>
    <USkeleton
      v-else
      class="aspect-square w-[min(92vw,70vh)]"
    />
    <p class="text-center text-lg">
      {{ t('station.help', 'Scan this code in the app, on your shift, to check in. It changes every 30 seconds.') }}
    </p>
  </div>
</template>
