import type {
  DefinedCollection } from '@nuxt/content'
import {
  defineCollection,
  defineContentConfig,
} from '@nuxt/content'
import { useNuxt } from '@nuxt/kit'
import { joinURL } from 'ufo'
import { WebsiteConfigSchema } from './shared/schema/config'
import { WebsitePageSchema } from './shared/schema/page'

const { options } = useNuxt()
const cwd = joinURL(options.rootDir, 'content')

// `@nuxtjs/i18n` is an optional dependency of the consuming app. When it is
// installed and configured with locales, content can be localized by nesting
// it under `content/<locale>/**`. Apps that don't opt into i18n keep using
// the flat `content/**` structure, so this stays fully opt-in.
const i18nOptions = (options as { i18n?: { locales?: (string | { code: string })[], defaultLocale?: string } }).i18n
const localeCodes = (i18nOptions?.locales || [])
  .map(locale => (typeof locale === 'string' ? locale : locale.code))

const collections: Record<string, DefinedCollection> = {}

const defineLocalizedCollections = (locale?: string) => {
  const suffix = locale ? `_${locale.replace(/-/g, '_')}` : ''
  const prefix = locale ? `${locale}/` : ''

  collections[`config${suffix}`] = defineCollection({
    type: 'data',
    source: {
      cwd,
      include: `${prefix}config.yaml`,
      prefix: '/',
    },
    schema: WebsiteConfigSchema,
  })

  collections[`pages${suffix}`] = defineCollection({
    type: 'page',
    source: {
      cwd,
      include: `${prefix}pages/**/**.md`,
      prefix: '/',
    },
    schema: WebsitePageSchema,
  })
}

if (localeCodes.length > 0) {
  localeCodes.forEach(defineLocalizedCollections)
} else {
  defineLocalizedCollections()
}

export default defineContentConfig({
  collections,
})
