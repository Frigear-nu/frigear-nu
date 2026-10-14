import { defineNuxtModule, extendPages, createResolver } from '@nuxt/kit'
import { landingPageExists } from '../utils/pages'
import { getAvailableLocales } from '../shared/utils/content'

// `@nuxtjs/i18n` is optional, so we avoid a hard dependency on its types and
// instead duck-type the subset of its config we need here.
type LayerI18nOptions = {
  locales?: Array<string | { code: string }>
  defaultLocale?: string
  routesNameSeparator?: string
}

// `@nuxtjs/i18n` detects the active locale of a route primarily from its
// route *name* (falling back to a locale prefix in the path otherwise), by
// splitting the name on this separator (`@nuxtjs/i18n` defaults to `___`,
// see `routesNameSeparator`). Since our own `i18n: false` routes below skip
// its automatic per-locale route generation (which normally produces names
// like `page___en`), we must replicate that naming convention ourselves so
// `@nuxtjs/i18n` can still resolve the correct active locale for them -
// notably including the *default* locale, whose paths have no locale
// prefix to fall back on (e.g. `/` or `/contact`).
const DEFAULT_ROUTE_NAME_SEPARATOR = '___'

// Locale-root paths (e.g. `/en`) must render the same landing page as `/`
// instead of falling through to the catch-all content page. Modelled on
// https://github.com/nuxt-content/docus/blob/main/layer/modules/routing.ts
export default defineNuxtModule({
  meta: {
    name: 'routing',
  },
  setup(_options, nuxt) {
    const { resolve } = createResolver(import.meta.url)

    const i18nOptions = (nuxt.options as typeof nuxt.options & { i18n?: LayerI18nOptions }).i18n
    const isI18nEnabled = !!i18nOptions?.locales
    const routeNameSeparator = i18nOptions?.routesNameSeparator || DEFAULT_ROUTE_NAME_SEPARATOR

    // Derived from the build-time config so the server and client always agree (reading the runtime i18n
    // state made the language picker render on the server and disappear after hydration).
    const publicConfig = nuxt.options.runtimeConfig.public as Record<string, unknown>
    publicConfig.multiLocale = getAvailableLocales(nuxt.options as typeof nuxt.options & { i18n?: LayerI18nOptions }).length > 1

    // Only add the landing route if the consuming app doesn't already
    // define its own `index.vue` (which takes precedence over the layer's).

    if (landingPageExists(nuxt.options.rootDir)) {
      console.warn(`Landing page already exists in the consuming app. Skipping layer landing page. -> make sure to handle locale routes properly.`)
      return
    }

    extendPages((pages) => {
      const pageExist = (path: string) => pages.find(page => page.path === path)

      const landingTemplate = resolve('../app/templates/LandingPage.vue')
      const localeCodes = getAvailableLocales(nuxt.options as typeof nuxt.options & { i18n?: LayerI18nOptions })
      if (isI18nEnabled) {
        const defaultLocale = i18nOptions?.defaultLocale

        // Generate a static route per locale index
        const localizedIndexPages = localeCodes.map(code => ({
          name: `lang-index${routeNameSeparator}${code}`,
          path: defaultLocale === code ? `/` : `/${code}`,
          file: landingTemplate,
          meta: {
            layout: 'default',
            // These paths are already locale-specific (e.g. `/en`), so
            // opt them out of `@nuxtjs/i18n`'s own automatic route
            // localization. Otherwise it prefixes each already-prefixed
            // path with its locale again (e.g. `/en` -> `/en/en`), which
            // registers a broken route that Nuxt then tries to prerender.
            i18n: false,
          },
        }))

        //
        if (localizedIndexPages.length > 0) {
          pages.push(...localizedIndexPages.filter(p => !pageExist(p.path)))
        }

        // ensures we set the layout here as well?
        for (const { path } of localizedIndexPages) {
          nuxt.options.nitro.routeRules ??= {}
          nuxt.options.nitro.routeRules[path] = {
            appLayout: 'default',
            ...nuxt.options.nitro.routeRules[path] || {},
          }
        }

        // The catch-all content route (`app/pages/[[lang]]/[...path].vue`)
        // uses a single, optional `[[lang]]` param to serve every locale
        // from one route. Replace it with an explicit route per locale
        // (default locale unprefixed, others prefixed) so its name can
        // carry the locale, same as the landing routes above.
        const catchAllPageIndex = pages.findIndex(page => page.path?.includes(':path(.*)*'))
        const [catchAllPage] = catchAllPageIndex !== -1 ? pages.splice(catchAllPageIndex, 1) : []
        if (catchAllPage) {
          const localizedCatchAllPages = localeCodes.map(code => ({
            ...catchAllPage,
            name: `${catchAllPage.name}${routeNameSeparator}${code}`,
            path: defaultLocale === code ? '/:path(.*)*' : `/${code}/:path(.*)*`,
            meta: { ...catchAllPage.meta, i18n: false },
          }))
          pages.push(...localizedCatchAllPages)
        }
      } else {
        pages.push({
          name: 'index',
          path: '/',
          file: landingTemplate,
          meta: {
            layout: 'default',
          },
        })
      }
    })
  },
})
