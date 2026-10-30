<script setup lang="ts">
import type { FormField } from '../../../types'
import { resolveCaptcha } from '../../utils'
import { captchaDefaultProvider, captchaSiteKey, loadCaptchaScript } from '../composables/useCaptcha'
import type { CaptchaApi } from '../composables/useCaptcha'
import { computed, onBeforeUnmount, onMounted, ref, useModuleT, useTemplateRef, watch } from '#imports'

const props = defineProps<{
  field: FormField
  /** Admin preview: shows a stub and supplies a dummy token instead of loading the provider. */
  preview?: boolean
  /** Bump to reset the widget (and clear the token), e.g. after a failed submit. */
  resetKey?: number
}>()
// The provider's response token; the server verifies it and never stores it.
const model = defineModel<string | undefined>()

const t = useModuleT('forms')
const config = computed(() => resolveCaptcha(props.field, captchaDefaultProvider()))
const siteKey = computed(() => captchaSiteKey(props.field))
const providerName = computed(() => t(`captcha.providers.${config.value.provider}`, config.value.provider))

const container = useTemplateRef<HTMLElement>('container')
const failed = ref(false)
let api: CaptchaApi | undefined
let widgetId: string | number | undefined

async function renderWidget() {
  if (props.preview || !container.value || !siteKey.value) return
  failed.value = false
  try {
    api = await loadCaptchaScript(config.value.provider)
  }
  catch {
    failed.value = true
    return
  }
  if (!container.value) return
  // reCAPTCHA and hCaptcha have no "auto" theme; they follow the light default.
  const theme = config.value.theme && (config.value.theme !== 'auto' || config.value.provider === 'turnstile') ? config.value.theme : undefined
  widgetId = api.render(container.value, {
    'sitekey': siteKey.value,
    theme,
    'size': config.value.size,
    'callback': (token: string) => { model.value = token },
    'expired-callback': () => { model.value = undefined },
    'error-callback': () => { model.value = undefined },
  })
}

function resetWidget() {
  model.value = props.preview ? 'preview' : undefined
  if (!props.preview && api && widgetId !== undefined) api.reset(widgetId)
}

// A token from before this mount belongs to a widget that is gone.
model.value = props.preview ? 'preview' : undefined
onMounted(renderWidget)
onBeforeUnmount(() => {
  if (api && widgetId !== undefined) api.remove?.(widgetId)
})
watch(() => props.resetKey, resetWidget)
watch([() => config.value.provider, siteKey], () => {
  if (api && widgetId !== undefined) api.remove?.(widgetId)
  widgetId = undefined
  if (container.value) container.value.innerHTML = ''
  model.value = undefined
  renderWidget()
})
</script>

<template>
  <div
    v-if="preview"
    data-testid="captcha-stub"
    class="flex items-center gap-3 rounded-md border border-dashed border-default bg-elevated/50 px-3 py-4 text-sm text-muted"
  >
    <UIcon
      name="i-lucide-shield-check"
      class="size-5 shrink-0"
    />
    <span>{{ t('captcha.preview', 'Captcha: {provider} — shown to visitors', { provider: providerName }) }}</span>
  </div>
  <UAlert
    v-else-if="!siteKey"
    color="error"
    variant="subtle"
    icon="i-lucide-shield-alert"
    :title="t('captcha.missingKey', 'The {provider} captcha has no site key configured.', { provider: providerName })"
  />
  <UAlert
    v-else-if="failed"
    color="error"
    variant="subtle"
    icon="i-lucide-shield-alert"
    :title="t('captcha.loadFailed', 'The captcha could not be loaded. Reload the page to try again.')"
  />
  <div
    v-else
    ref="container"
    data-testid="captcha-widget"
    class="min-h-[65px]"
  />
</template>
