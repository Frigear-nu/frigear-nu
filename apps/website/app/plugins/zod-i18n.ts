import { z } from 'zod'

type Translate = (key: string, values?: Record<string, unknown>) => string

const boundKey = (iss: { exact?: boolean, inclusive?: boolean }) =>
  iss.exact ? 'exact' : iss.inclusive ? 'inclusive' : 'not_inclusive'

// Translates zod v4 issues via the `zodI18n.*` messages. Schemas can also force a message with
// `params: { i18n: { key, values } }` on a custom/refine issue (see `shared/schema/*`).
export default defineNuxtPlugin({
  name: 'zod-i18n',
  dependsOn: ['i18n:plugin'],
  setup(nuxtApp) {
    const i18n = nuxtApp.$i18n as { t: Translate, te: (key: string) => boolean, d: (value: Date) => string }
    const t: Translate = (key, values) => i18n.t(key, values ?? {})

    z.config({
      customError: (iss) => {
        const params = (iss as { params?: { i18n?: { key: string, values?: Record<string, unknown> } } }).params
        if (params?.i18n?.key) {
          return t(params.i18n.key, params.i18n.values)
        }

        switch (iss.code) {
          case 'invalid_type':
            if (iss.input === undefined) return t('zodI18n.errors.invalid_type_received_undefined')
            return t('zodI18n.errors.invalid_type', {
              expected: t(`zodI18n.types.${iss.expected}`),
              received: t(`zodI18n.types.${iss.input === null ? 'null' : typeof iss.input}`),
            })

          case 'invalid_format':
            return iss.format === 'email'
              ? t('zodI18n.errors.invalid_string.email', { validation: t('zodI18n.validations.email') })
              : undefined

          case 'too_small':
          case 'too_big': {
            const isSmall = iss.code === 'too_small'
            const key = `zodI18n.errors.${iss.code}.${iss.origin}.${boundKey(iss)}`
            if (!i18n.te(key)) return undefined
            const limit = isSmall ? iss.minimum : iss.maximum
            return t(key, {
              [isSmall ? 'minimum' : 'maximum']: iss.origin === 'date' ? i18n.d(new Date(Number(limit))) : limit,
            })
          }

          case 'unrecognized_keys':
            return t('zodI18n.errors.unrecognized_keys', { keys: iss.keys.join(', ') })

          default:
            return undefined
        }
      },
    })
  },
})
