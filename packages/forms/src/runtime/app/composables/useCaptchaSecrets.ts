import type { FormField, FormSecretsDto } from '../../../types'
import { resolveCaptcha } from '../../utils'
import { captchaDefaultProvider } from './useCaptcha'

/**
 * The write-only captcha secret key of a saved form. It is stored right away through the admin secrets API,
 * not with the definition. `field` is the currently selected field; the state only applies when it is a captcha.
 */
export function useCaptchaSecrets(formId: MaybeRefOrGetter<string | undefined>, field: MaybeRefOrGetter<FormField | undefined>) {
  const t = useModuleT('forms')
  const toast = useToast()

  const captcha = computed(() => {
    const selected = toValue(field)
    return selected?.type === 'captcha' ? resolveCaptcha(selected, captchaDefaultProvider()) : undefined
  })
  const secrets = ref<FormSecretsDto>()
  const url = computed(() => toValue(formId) ? `/api/forms/admin/forms/${toValue(formId)}/secrets` : undefined)
  const value = ref('')
  const saving = ref(false)
  // True until the first load settled, so the status line shows a placeholder instead of a wrong "Not set".
  const loading = ref(Boolean(toValue(formId)))
  const source = computed(() => captcha.value ? secrets.value?.captcha[captcha.value.provider]?.source : undefined)
  const statusLabel = computed(() => ({
    form: t('captcha.secretForm', 'Configured via form'),
    env: t('captcha.secretEnv', 'Configured via environment'),
    unset: t('captcha.secretUnset', 'Not set'),
  })[source.value ?? 'unset'])

  async function load() {
    if (!url.value) {
      loading.value = false
      return
    }
    try {
      secrets.value = await $fetch<FormSecretsDto>(url.value)
    }
    catch {
      secrets.value = undefined
    }
    finally {
      loading.value = false
    }
  }
  onMounted(load)
  watch(() => captcha.value?.provider, () => {
    value.value = ''
  })

  async function save() {
    if (!url.value || !captcha.value || !value.value.trim()) return
    saving.value = true
    try {
      secrets.value = await $fetch<FormSecretsDto>(url.value, { method: 'PUT', body: { key: `captcha.${captcha.value.provider}.secretKey`, value: value.value.trim() } })
      value.value = ''
      toast.add({ title: t('captcha.secretSaved', 'Secret key saved.'), color: 'success' })
    }
    catch {
      toast.add({ title: t('captcha.secretFailed', 'The secret key could not be saved.'), color: 'error' })
    }
    finally {
      saving.value = false
    }
  }

  async function remove() {
    if (!url.value || !captcha.value) return
    try {
      secrets.value = await $fetch<FormSecretsDto>(`${url.value}/captcha.${captcha.value.provider}.secretKey`, { method: 'DELETE' })
      toast.add({ title: t('captcha.secretRemoved', 'Secret key removed.'), color: 'success' })
    }
    catch {
      toast.add({ title: t('captcha.secretFailed', 'The secret key could not be saved.'), color: 'error' })
    }
  }

  return reactive({
    /** The resolved captcha settings of the selected field. */
    captcha,
    secrets,
    /** What the admin is typing, not saved yet. */
    value,
    saving,
    loading,
    source,
    statusLabel,
    setValue: (next: string) => {
      value.value = next
    },
    save,
    remove,
  })
}

export type CaptchaSecrets = ReturnType<typeof useCaptchaSecrets>
