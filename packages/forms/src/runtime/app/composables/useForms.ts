import type { FormDefinition, FormField, PublicFormDto } from '../../../types'
import { resolveVisibility, translate } from '../../utils'

/** Locale for translated form content: `@nuxtjs/i18n`'s when installed, otherwise `en`. */
export function useFormsLocale() {
  const nuxtApp = useNuxtApp() as { $i18n?: { locale?: { value?: string } } }
  return computed(() => nuxtApp.$i18n?.locale?.value ?? 'en')
}

/** Locales content can be translated into: `@nuxtjs/i18n`'s configured locales when installed, otherwise just `en`. */
export function useFormsLocales() {
  const nuxtApp = useNuxtApp() as { $i18n?: { locales?: { value?: (string | { code: string })[] } } }
  return computed(() => {
    const codes = (nuxtApp.$i18n?.locales?.value ?? []).map(locale => typeof locale === 'string' ? locale : locale.code)
    return codes.length ? codes : ['en']
  })
}

/** Loads a published form definition by slug. */
export function useForm(slug: MaybeRefOrGetter<string>) {
  return useFetch<PublicFormDto>(() => `/api/forms/${toValue(slug)}`, { key: `forms:${toValue(slug)}` })
}

/** Initial answers: empty arrays for files, `false` for checkboxes, everything else unset. */
export function emptyAnswers(definition: Pick<FormDefinition, 'steps'>): Record<string, unknown> {
  const state: Record<string, unknown> = {}
  for (const step of definition.steps) {
    for (const field of step.fields) {
      if (field.type === 'file') state[field.key] = []
      else if (field.type === 'checkbox') state[field.key] = false
      else if (field.type !== 'markdown') state[field.key] = undefined
    }
  }
  return state
}

/** Posts the answers: JSON for forms without files, multipart (answers + `file:<key>` parts) otherwise. */
export async function submitAnswers(slug: string, definition: Pick<FormDefinition, 'steps'>, answers: Record<string, unknown>, locale: string) {
  const files: { key: string, file: File }[] = []
  const plain: Record<string, unknown> = {}
  const visible = new Set(resolveVisibility(definition as FormDefinition, answers).flatMap(step => step.fields.map(field => field.key)))

  for (const [key, value] of Object.entries(answers)) {
    if (!visible.has(key)) continue
    if (Array.isArray(value) && value.every(item => item instanceof File)) {
      files.push(...value.map(file => ({ key, file })))
      continue
    }
    plain[key] = value
  }

  if (!files.length) {
    return $fetch<{ ok: true, id: string | null }>(`/api/forms/${slug}/submit`, { method: 'POST', body: { answers: plain, locale } })
  }
  const body = new FormData()
  body.append('answers', JSON.stringify(plain))
  body.append('locale', locale)
  for (const { key, file } of files) body.append(`file:${key}`, file, file.name)
  return $fetch<{ ok: true, id: string | null }>(`/api/forms/${slug}/submit`, { method: 'POST', body })
}

const DEFAULT_PATHS = {
  form: '/forms/:slug',
  admin: '/admin/forms',
  adminForm: '/admin/forms/:id',
  adminSubmissions: '/admin/forms/:id/submissions',
  adminSubmission: '/admin/forms/:id/submissions/:submissionId',
} as const

/** Resolves the (configurable) page paths, filling in params. */
export function useFormsPaths() {
  const pages = (useRuntimeConfig().public.forms as { pages?: Partial<Record<keyof typeof DEFAULT_PATHS, string>> } | undefined)?.pages ?? {}
  return (name: keyof typeof DEFAULT_PATHS, params: Record<string, string> = {}) =>
    Object.entries(params).reduce((path, [key, value]) => path.replace(`:${key}`, encodeURIComponent(value)), pages[name] ?? DEFAULT_PATHS[name])
}

/** Label of a field in the given locale, falling back to its key. */
export const fieldLabel = (field: FormField, locale: string) => translate(field.label, locale) || field.key
