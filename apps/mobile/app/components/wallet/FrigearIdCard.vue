<script setup lang="ts">
import { renderSVG } from 'uqr'
import type { FrigearIdCode } from '#shared/types/frigear-id'

// The signed-in user's Frigear ID: a QR code of a signed code that lives `expiresIn` seconds (`GET /api/account/id-code`
// on the website, as its own FrigearIdCode.vue), fetched again when it runs out. Crew scan it to see who the user is.
// The countdown runs only while the Wallet is on screen; coming back to it with an expired code fetches a new one.
const { t } = useI18n()
const { user } = useUserSession()

const { data, status, error, refresh } = await useFetch<FrigearIdCode>('/api/account/id-code', { key: 'wallet-id-code' })

const name = computed(() => (user.value as { name?: string } | null)?.name ?? '')
const id = computed(() => user.value?.id ?? '')

const expiresAt = ref(0)
const now = ref(Date.now())
watch(data, (value) => {
  expiresAt.value = value ? Date.now() + value.expiresIn * 1000 : 0
}, { immediate: true })

const remaining = computed(() => Math.max(0, Math.ceil((expiresAt.value - now.value) / 1000)))
const refreshing = computed(() => status.value === 'pending')

function tick() {
  now.value = Date.now()
  if (data.value && !refreshing.value && !error.value && remaining.value <= 0) void refresh()
}

let timer: ReturnType<typeof setInterval> | undefined
const start = () => {
  stop()
  tick()
  timer = setInterval(tick, 1000)
}
const stop = () => {
  if (timer) clearInterval(timer)
  timer = undefined
}
onMounted(start)
onActivated(start)
onDeactivated(stop)
onBeforeUnmount(stop)

// An <img> data URI (not v-html): the SVG is generated here from the code and never parsed as markup.
const qr = computed(() => data.value ? `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(data.value.payload, { ecc: 'L', border: 1 }))}` : null)
</script>

<template>
  <SectionCard
    :title="t('app.wallet.id.title')"
    :description="t('app.wallet.id.description')"
    icon="i-lucide-id-card"
  >
    <UAlert
      v-if="error && !data"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="t('app.wallet.id.error')"
      :actions="[{ label: t('app.wallet.id.retry'), color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <div
      v-else
      class="flex flex-col items-center gap-3"
      data-frigear-id
    >
      <USkeleton
        v-if="!qr"
        class="size-64 rounded-lg"
      />
      <img
        v-else
        :src="qr"
        :alt="t('app.wallet.id.qrAlt')"
        class="size-64 rounded-lg bg-white p-2"
        :class="{ 'opacity-40': refreshing }"
      >
      <div class="flex flex-col items-center gap-0.5 text-center">
        <p
          v-if="name"
          class="text-lg font-semibold text-highlighted"
        >
          {{ name }}
        </p>
        <p class="text-sm text-muted tabular-nums">
          {{ t('app.wallet.id.number', { id }) }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UBadge
          v-if="data"
          color="neutral"
          variant="subtle"
          icon="i-lucide-timer"
          class="tabular-nums"
          :label="t('app.wallet.id.refreshesIn', { seconds: remaining })"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="sm"
          :loading="refreshing"
          :label="t('app.wallet.id.refresh')"
          @click="refresh()"
        />
      </div>
    </div>
  </SectionCard>
</template>
