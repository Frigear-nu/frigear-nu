/**
 * Removes a leading `/<locale>` segment (one of `codes`), the query, the hash and a trailing slash from a path, so
 * paths compare the same with and without an `@nuxtjs/i18n` prefix: `stripLocale('/da/admin/', ['en', 'da'])` is
 * `/admin`.
 */
export function stripLocale(path: string, codes: readonly string[]): string {
  const pathname = path.split(/[?#]/)[0] || '/'
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname
  const first = trimmed.split('/')[1]
  if (!first || !codes.includes(first)) return trimmed
  return trimmed.slice(first.length + 1) || '/'
}

/** Whether `to` points outside the app (`https://…`, `mailto:…`, protocol-relative `//…`). */
export function isExternalPath(to: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(to)
}
