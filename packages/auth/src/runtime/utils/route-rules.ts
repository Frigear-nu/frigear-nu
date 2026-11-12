// Framework-free resolution of the access route rules (`permission`, `authenticated`, `guest`) for a request path.
// Auth's server middleware enforces them on `/api/**`; `@frigear-nu/authorization` may reuse it for pages.

export interface AccessRouteRule {
  permission?: string
  authenticated?: boolean
  guest?: boolean
}

const RULE_KEYS = ['permission', 'authenticated', 'guest'] as const

/** The access keys of `routeRules` (and Nitro's), by pattern; patterns without any are left out. */
export function pickAccessRouteRules(...sources: Array<Readonly<Record<string, unknown>> | undefined>): Record<string, AccessRouteRule> {
  const result: Record<string, AccessRouteRule> = {}
  for (const source of sources) {
    for (const [pattern, rule] of Object.entries(source ?? {})) {
      if (!rule || typeof rule !== 'object') continue
      const picked = Object.fromEntries(RULE_KEYS.filter(key => key in rule).map(key => [key, (rule as Record<string, unknown>)[key]]))
      if (Object.keys(picked).length) result[pattern] = { ...result[pattern], ...picked } as AccessRouteRule
    }
  }
  return result
}

/** Match a route path against a pattern: `/admin/**` (prefix), `*` (single segment) or an exact path. */
export function matchRoute(pattern: string, path: string): boolean {
  const normalize = (value: string) => value.replace(/\/+$/, '') || '/'
  const p = normalize(pattern)
  const s = normalize(path)
  if (p.endsWith('/**')) {
    const base = p.slice(0, -3)
    return s === base || s.startsWith(`${base}/`)
  }
  const patternSegments = p.split('/')
  const pathSegments = s.split('/')
  return patternSegments.length === pathSegments.length
    && patternSegments.every((segment, index) => segment === '*' || segment === pathSegments[index])
}

/**
 * The request path route rules are matched against: h3's `event.path` without the query, repeated slashes collapsed.
 * `null` for a path no rule can be trusted to match: an encoded `/` (`%2F`), a `\` (or `%5C`), or a `.`/`..` segment
 * (also encoded as `%2E`). The middleware refuses those with a 400.
 */
export function normalizeRequestPath(path: string): string | null {
  const pathname = path.split('?', 1)[0] ?? ''
  if (/%2f|%5c|\\/i.test(pathname)) return null
  if (pathname.split('/').some(segment => /^(?:\.|%2e){1,2}$/i.test(segment))) return null
  return pathname.replace(/\/{2,}/g, '/') || '/'
}

/** How specific a pattern is: more literal segments win, an exact pattern beats a trailing `/**`. */
function specificity(pattern: string): number {
  const segments = pattern.split('/').filter(Boolean)
  const literals = segments.filter(segment => segment !== '*' && segment !== '**').length
  return literals * 10 + (pattern.endsWith('/**') ? 0 : 5)
}

/**
 * The rule for a path: every matching pattern contributes, keys of more specific patterns override less specific
 * ones. `exempt` patterns (auth's anonymous entry points) reset it, so a less specific guard (`'/**': { authenticated:
 * true }`) stops there while a rule more specific than the exemption still applies. `undefined` when nothing applies,
 * also when the result says `authenticated: false`.
 */
export function resolveAccessRouteRule(routes: Readonly<Record<string, AccessRouteRule>> | undefined, path: string, exempt: readonly string[] = []): AccessRouteRule | undefined {
  const matches: [string, AccessRouteRule | null][] = [
    ...Object.entries(routes ?? {}),
    ...exempt.map(pattern => [pattern, null] as [string, null]),
  ]
  const sorted = matches
    .filter(([pattern]) => matchRoute(pattern, path))
    .sort(([a, x], [b, y]) => specificity(a) - specificity(b) || (x === null ? -1 : 0) - (y === null ? -1 : 0))
  let rule: AccessRouteRule | undefined
  for (const [, entry] of sorted) rule = entry === null ? undefined : { ...rule, ...entry }
  if (!rule || (rule.authenticated === false && !rule.permission && !rule.guest)) return undefined
  return rule
}
