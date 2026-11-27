<script setup lang="ts">
import { FRIGEAR_ID_PREFIX, type ScanMode } from '~/composables/useScanModes'
import type { ScanOutcome } from '~/composables/useScanCheck'

// The scanner of the Wallet tab, one page for every kind of code: Frigear IDs (crew), tickets at the door (event
// managers) and shift passes (bar managers). The mode switch shows the modes the user may use; a Frigear ID code is
// always checked as one, whatever the mode. Each code read is checked with the website and the result stays on screen
// until the next one; a repeat of the same code within a few seconds is ignored. The code can be typed too.
definePageMeta({
  mobile: { title: 'Scan', titleKey: 'app.wallet.scan.title', largeTitle: false, pullToRefresh: false },
})

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const native = useNative()
const check = useScanCheck()
await useAuthorization().ensure()
const { modes } = useScanModes()

// The mode from `?mode=` (a deep link), else the first the user may use.
const requested = typeof route.query.mode === 'string' ? route.query.mode : undefined
const mode = ref<ScanMode | undefined>(modes.value.find(item => item.id === requested)?.id ?? modes.value[0]?.id)
watch(modes, (list) => {
  if (!list.some(item => item.id === mode.value)) mode.value = list[0]?.id
})
const items = computed(() => modes.value.map(item => ({ label: t(`app.wallet.scan.modes.${item.id}`), icon: item.icon, value: item.id })))

const outcome = ref<ScanOutcome | null>(null)
const manual = ref('')
const busy = ref(false)

// The camera reads the same code many times a second while it stays in view: a repeat of the last code within a few
// seconds is ignored, until a different code is scanned (as the shifts team scanner).
const REPEAT_MS = 3000
let last: { code: string, at: number } | null = null

async function scan(value: string, typed = false) {
  const code = value.trim()
  if (!code || busy.value || !mode.value) return
  if (!typed && last && last.code === code && Date.now() - last.at < REPEAT_MS) return
  last = { code, at: Date.now() }
  const target: ScanMode = code.startsWith(FRIGEAR_ID_PREFIX) && modes.value.some(item => item.id === 'frigear-id') ? 'frigear-id' : mode.value
  mode.value = target
  busy.value = true
  try {
    outcome.value = await check(target, code)
    manual.value = ''
    void native.haptic(outcome.value.tone)
  }
  finally {
    busy.value = false
  }
}

// A new mode starts clean: the last result was about another kind of code.
watch(mode, () => {
  outcome.value = null
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <UEmpty
      v-if="!modes.length"
      icon="i-lucide-scan-line"
      :title="t('app.wallet.scan.none.title')"
      :description="t('app.wallet.scan.none.description')"
      :actions="[{ label: t('app.wallet.scan.none.back'), to: localePath('/wallet'), color: 'neutral', variant: 'outline' }]"
    />
    <template v-else>
      <UTabs
        v-if="items.length > 1"
        v-model="mode"
        :items="items"
        :content="false"
        class="w-full"
        data-scan-modes
      />
      <p class="text-sm text-muted">
        {{ t(`app.wallet.scan.hints.${mode}`) }}
      </p>

      <WalletScanResult
        v-if="outcome"
        :outcome="outcome"
      />

      <WalletScanCamera
        :paused="busy"
        @detect="scan"
      />

      <form
        class="flex gap-2"
        @submit.prevent="scan(manual, true)"
      >
        <UInput
          v-model="manual"
          :placeholder="t('app.wallet.scan.manual.placeholder')"
          :aria-label="t('app.wallet.scan.manual.label')"
          autocomplete="off"
          autocapitalize="off"
          class="flex-1"
        />
        <UButton
          type="submit"
          color="neutral"
          variant="outline"
          :loading="busy"
          :disabled="!manual.trim()"
          :label="t('app.wallet.scan.manual.submit')"
        />
      </form>
    </template>
  </div>
</template>
