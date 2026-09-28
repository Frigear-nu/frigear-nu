export type LocaleLike = string | {
  code: string
  name?: string
}

export type NormalizedLocale = {
  code: string
  name: string
}

export function normalizeLocales(locales?: readonly LocaleLike[] | null): NormalizedLocale[] {
  return (locales || []).map((localeItem) => {
    if (typeof localeItem === 'string') {
      return {
        code: localeItem,
        name: localeItem
      }
    }

    return {
      code: localeItem.code,
      name: localeItem.name || localeItem.code
    }
  })
}
