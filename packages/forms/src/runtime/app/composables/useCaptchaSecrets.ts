import type { FormField, FormSecretsDto } from '../../../types'
import { formsApi, resolveCaptcha } from '../../utils'
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
  const id = computed(() => toValue(formId))
  const url = computed(() => id.value ? formsApi.admin.secrets(id.value) : undefined)
  const secretKey = () => `captcha.${captcha.value!.provider}.secretKey`
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
    if (!id.value || !captcha.value || !value.value.trim()) return
    saving.value = true
    try {
      secrets.value = await $fetch<FormSecretsDto>(formsApi.admin.secret(id.value, secretKey()), { method: 'PUT', body: { value: value.value.trim() } })
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
    if (!id.value || !captcha.value) return
    try {
      // 204: read the secrets again.
      await $fetch(formsApi.admin.secret(id.value, secretKey()), { method: 'DELETE' })
      await load()
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
