import type { AuthorizationResponse, AuthorizeMeta, RouteRule } from './types'

/**
 * Match a route path against a pattern: `/admin/**` (prefix), `*` (single segment) or an exact path.
 */
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

/** How specific a pattern is - more literal segments win, and an exact pattern beats a trailing `/**`. */
function specificity(pattern: string): number {
  const segments = pattern.split('/').filter(Boolean)
  const literals = segments.filter(segment => segment !== '*' && segment !== '**').length
  return literals * 10 + (pattern.endsWith('/**') ? 0 : 5)
}

/**
 * Resolve the rule for a path from `routeRules`-style entries. Like Nitro's route rules, every matching pattern
 * contributes and keys of more specific patterns override less specific ones. Returns `undefined` when nothing
 * applies, including when the merged result says `authenticated: false`.
 *
 * `exempt` patterns (Auth's anonymous entry points) reset the rule: guards of less specific patterns
 * (`'/**': { authenticated: true }`) stop there, while an app rule more specific than the exemption still applies.
 */
export function resolveRule(routes: Record<string, RouteRule> | undefined, path: string, exempt: string[] = []): RouteRule | undefined {
  const matches: [string, RouteRule | null][] = [
    ...Object.entries(routes ?? {}),
    // Same specificity as an app pattern: the app's entry sorts after the reset and wins.
    ...exempt.map(pattern => [pattern, null] as [string, null]),
  ]
  const sorted = matches
    .filter(([pattern]) => matchRoute(pattern, path))
    .sort(([a, x], [b, y]) => specificity(a) - specificity(b) || (x === null ? -1 : 0) - (y === null ? -1 : 0))
  let rule: RouteRule | undefined
  for (const [, entry] of sorted) rule = entry === null ? undefined : { ...rule, ...entry }
  return !rule || rule.authenticated === false ? undefined : rule
}

/** The rule of `definePageMeta({ authorize })`; `false` is no rule at all (the page is open). A string is a permission. */
export function normalizeAuthorizeMeta(meta: AuthorizeMeta): RouteRule | undefined {
  if (meta === false) return undefined
  if (typeof meta === 'string') return { permission: meta }
  return meta
}

/**
 * Evaluate a rule for the visitor, with the same semantics as auth's API middleware: `signedIn` says whether there is a
 * visitor at all, `can` whether they hold a permission (without a record). A `guest` rule is for signed-out visitors
 * only (403 otherwise); a `permission` or `authenticated` rule answers 401 to guests and 403 without the permission.
 */
export function evaluateRule(rule: RouteRule, signedIn: boolean, can: (permission: string) => boolean): AuthorizationResponse {
  if (rule.authenticated === false) return { authorized: true }
  if (rule.guest) return signedIn ? { authorized: false, statusCode: 403, message: 'Only for signed-out users' } : { authorized: true }
  if (!rule.permission && !rule.authenticated) return { authorized: true }
  if (!signedIn) return { authorized: false, statusCode: 401, message: 'Authentication required' }
  if (rule.permission && !can(rule.permission)) return { authorized: false, statusCode: 403, message: 'Forbidden' }
  return { authorized: true }
}

/** The permissions named by rules (route rules and page meta), for the build-time check that they are registered. */
export function rulePermissions(rules: Iterable<RouteRule | undefined>): string[] {
  const names = new Set<string>()
  for (const rule of rules) if (rule?.permission) names.add(rule.permission)
  return [...names].sort()
}

/**
 * The route rule patterns that neither match a page nor sit under `/api/`. Only pages (the app route middleware) and
 * `/api/**` (the Nitro middleware) are enforced: a rule for a server route such as `/mcp` or `/oauth/**` would
 * silently do nothing on the server. `pagePaths` are the vue-router paths of the app (`/users/:id()`, `/:all(.*)*`);
 * `localePrefixes` are the `/<locale>` prefixes pages may also be served under. `/**` is a catch-all and never listed.
 */
export function findUnenforcedPatterns(patterns: string[], pagePaths: string[], localePrefixes: string[] = []): string[] {
  // A catch-all page (`/docs/:slug(.*)*`) serves everything below its base.
  const catchAllBases = pagePaths.filter(path => /\/:[^/]*\(\.\*\)\*/.test(path)).map(path => path.slice(0, path.search(/\/:[^/]*\(\.\*\)\*/)))
  const concrete = pagePaths.map(path => path
    .replace(/\/:[^/]*\(\.\*\)\*/g, '/x/x')
    .replace(/\/:[^/]*/g, '/x')
    .replace(/\/{2,}/g, '/') || '/')
  const variants = concrete.flatMap(path => [path, ...localePrefixes
    .filter(prefix => path === prefix || path.startsWith(`${prefix}/`))
    .map(prefix => path.slice(prefix.length) || '/')])
  return patterns.filter((pattern) => {
    if (pattern === '/**' || pattern.startsWith('/api/') || pattern === '/api') return false
    // The literal part of the pattern, before its first wildcard segment.
    const literal = pattern.split(/\/\*\*?(?:\/|$)/, 1)[0]!
    if (catchAllBases.some(base => literal === base || literal.startsWith(`${base}/`))) return false
    return !variants.some(path => matchRoute(pattern, path))
  })
}
