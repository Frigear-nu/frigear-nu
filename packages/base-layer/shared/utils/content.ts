type ConfigWithLocales = {
  i18n?: { locales?: Array<string | { code: string }> }
}

// Matches the locale-suffixed collection naming defined in `content.config.ts`

// (e.g. `config` -> `config_no` when the app opts into `@nuxtjs/i18n`).
export function localizedCollectionName<Name extends string>(
  name: Name,
  locale?: string,
) {
  return (locale ? `${name}_${locale.replace(/-/g, '_')}` : name) as Name
}

export function stringOrPropValue<Prop extends Record<string, unknown>>(
  prop: string | undefined | Prop,
  key: Prop extends string ? string : keyof Prop,
) {
  if (typeof prop === 'undefined') {
    return undefined
  }
  if (typeof prop === 'string') {
    return prop
  }
  return prop?.[key]
}

export function getAvailableLocales(
  config: ConfigWithLocales,
): string[] {
  return config.i18n?.locales
    ? config.i18n.locales.map(locale => typeof locale === 'string' ? locale : locale.code)
    : []
}

export function getCollectionsToQuery(
  locale: string | undefined,
  availableLocales: string[],
): string[] {
  if (locale && availableLocales.includes(locale)) {
    return [`pages_${locale}`]
  }

  return availableLocales.length > 0
    ? availableLocales.map(l => `pages_${l}`)
    : ['pages']
}

export function getCollectionFromPath(
  path: string,
  availableLocales: string[],
): string {
  const pathSegments = path.split('/').filter(Boolean)
  const firstSegment = pathSegments[0]

  if (firstSegment && availableLocales.includes(firstSegment)) {
    return `pages_${firstSegment}`
  }

  return 'pages'
}
