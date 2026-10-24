import { parseURL, stringifyParsedURL } from 'ufo'

/**
 * Adds the i18n language alternates to the head of every page: a
 * `<link rel="alternate" hreflang>` per locale plus `x-default`, and
 * `og:locale:alternate` for the other locales.
 *
 * Only those tags are taken from `useLocaleHead()`. Its canonical, `og:url`
 * and `lang` would duplicate the ones nuxt-seo-utils already sets, so they
 * are dropped. Hrefs are made absolute with the same site resolver
 * nuxt-seo-utils uses for the canonical, so both share `site.url`.
 *
 * Emits nothing on single-locale sites or when the app config sets
 * `seo.localeAlternates: false`.
 */
export const useLocaleAlternates = () => {
  const appConfig = useAppConfig()
  const { locales } = useI18n()
  const error = useError()
  const localeHead = useLocaleHead({ dir: false, lang: false, seo: true })
  const resolveUrl = createSitePathResolver({ absolute: true, withBase: true })

  const enabled = computed(() =>
    appConfig.seo?.localeAlternates !== false && locales.value.length > 1 && !error.value,
  )

  // i18n prefixes hrefs with its own `baseUrl` when one is set; keep only the
  // path so the site resolver decides the origin.
  const toAbsolute = (href: string) => {
    const { pathname, search, hash } = parseURL(href)
    return resolveUrl(stringifyParsedURL({ pathname, search, hash })).value
  }

  useHead({
    link: () => {
      if (!enabled.value) return []
      return (localeHead.value.link ?? [])
        .flatMap(link => (link.rel === 'alternate' && 'hreflang' in link && link.hreflang && link.href)
          ? [{
              key: `locale-alternate-${link.hreflang}`,
              rel: 'alternate' as const,
              hreflang: link.hreflang,
              href: toAbsolute(link.href),
            }]
          : [])
    },
    meta: () => {
      if (!enabled.value) return []
      // Same rule as nuxt-seo-utils' `og:locale`: `ll_TT` only, values
      // without a territory are not valid Open Graph locales.
      return (localeHead.value.meta ?? [])
        .filter(meta => meta.property === 'og:locale:alternate' && meta.content)
        .map(meta => String(meta.content).replace(/-/g, '_'))
        .filter(content => content.includes('_'))
        .map(content => ({
          key: `og-locale-alternate-${content}`,
          property: 'og:locale:alternate',
          content,
        }))
    },
  })
}
