import type { CaptchaProvider, FormField } from '../../../types'
import { normalizeCaptchaProvider, resolveCaptcha } from '../../utils'
import { useRuntimeConfig } from '#imports'

type WidgetOptions = {
  'sitekey': string
  'theme'?: string
  'size'?: string
  'callback': (token: string) => void
  'expired-callback': () => void
  'error-callback': () => void
}

/** The part of the Turnstile / reCAPTCHA / hCaptcha browser APIs this module uses (they share one shape). */
export type CaptchaApi = {
  render: (container: HTMLElement, options: WidgetOptions) => string | number
  reset: (id?: string | number) => void
  remove?: (id?: string | number) => void
}

const SCRIPTS: Record<CaptchaProvider, { src: string, global: string }> = {
  turnstile: { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js', global: 'turnstile' },
  recaptcha: { src: 'https://www.google.com/recaptcha/api.js', global: 'grecaptcha' },
  hcaptcha: { src: 'https://js.hcaptcha.com/1/api.js', global: 'hcaptcha' },
}

const loading = new Map<CaptchaProvider, Promise<CaptchaApi>>()

/** Loads the provider's script once, in the browser only, and resolves with its global API. */
export function loadCaptchaScript(provider: CaptchaProvider): Promise<CaptchaApi> {
  if (import.meta.server) return Promise.reject(new Error('Captcha scripts only load in the browser.'))
  const existing = loading.get(provider)
  if (existing) return existing

  const { src, global } = SCRIPTS[provider]
  const callback = `__formsCaptchaLoaded_${provider}`
  const promise = new Promise<CaptchaApi>((resolve, reject) => {
    const scope = window as unknown as Record<string, unknown>
    scope[callback] = () => resolve(scope[global] as CaptchaApi)
    const script = document.createElement('script')
    script.src = `${src}?render=explicit&onload=${callback}`
    script.async = true
    script.defer = true
    script.onerror = () => {
      loading.delete(provider)
      script.remove()
      reject(new Error(`Could not load the ${provider} script.`))
    }
    document.head.appendChild(script)
  })
  loading.set(provider, promise)
  return promise
}

type PublicCaptchaConfig = { captcha?: Partial<Record<CaptchaProvider, { siteKey?: string }>> & { defaultProvider?: string } }

/** Provider of a captcha field with none set: `runtimeConfig.public.forms.captcha.defaultProvider` (env `NUXT_PUBLIC_FORMS_CAPTCHA_DEFAULT_PROVIDER`). */
export function captchaDefaultProvider(): CaptchaProvider {
  return normalizeCaptchaProvider((useRuntimeConfig().public.forms as PublicCaptchaConfig | undefined)?.captcha?.defaultProvider)
}

/** Public site key for a captcha field: its own override, else the module's `public.forms.captcha.<provider>.siteKey`. */
export function captchaSiteKey(field: Pick<FormField, 'captcha'>): string {
  const { provider, siteKey } = resolveCaptcha(field, captchaDefaultProvider())
  if (siteKey) return siteKey
  const config = useRuntimeConfig().public.forms as PublicCaptchaConfig | undefined
  return config?.captcha?.[provider]?.siteKey ?? ''
}
