import { isAbility } from './ability'
import { normalizeResponse } from './bouncer'
import type { Ability, AuthorizationResponse, AuthorizeMeta, RouteRule, RuleCredential } from './types'

export type AbilityRegistry = Record<string, unknown>

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

/**
 * The request path that route rules are matched against: h3's `event.path` (what the router dispatches on, already
 * percent-decoded except for `%2F`) without the query, with repeated slashes collapsed. Returns `null` for a path that
 * no rule can be trusted to match: one holding an encoded `/` (`%2F`), a `\` (or `%5C`), or a `.`/`..` segment
 * (also when still encoded as `%2E`). Callers refuse those with a 400.
 */
export function normalizeRequestPath(path: string): string | null {
  const pathname = path.split('?', 1)[0] ?? ''
  if (/%2f|%5c|\\/i.test(pathname)) return null
  if (pathname.split('/').some(segment => /^(?:\.|%2e){1,2}$/i.test(segment))) return null
  return pathname.replace(/\/{2,}/g, '/') || '/'
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

/** The rule of `definePageMeta({ authorize })`; `false` is no rule at all (the page is open). */
export function normalizeAuthorizeMeta(meta: AuthorizeMeta): RouteRule | undefined {
  if (meta === false) return undefined
  if (typeof meta === 'string') return { ability: meta }
  if (isAbility(meta)) return { ability: meta }
  return meta
}

/** Same semantics as `hasScopes` of `@frigear-nu/auth` (`*`, `resource:*`, personal-data scopes by name only). */
export function holdsScopes(granted: readonly string[], required: readonly string[]): boolean {
  return required.every((scope) => {
    if (scope.endsWith(':pii')) return granted.includes(scope)
    if (granted.includes('*') || granted.includes(scope)) return true
    const separator = scope.indexOf(':')
    return separator > 0 && granted.includes(`${scope.slice(0, separator)}:*`)
  })
}

/**
 * Evaluate a declarative route rule for an already-resolved user.
 * Unauthenticated visitors get 401 (unless `guest` is set), role/ability mismatches get 403.
 *
 * `credential` is how the caller authenticated (server middleware only; omit it for a cookie session). A bearer
 * credential (kind other than `session`) is refused with 403 when the rule is session-only: `sessionOnly: true`, or
 * by default a rule with `roles` or `ability` that lists no `scopes`. A rule with `scopes` requires the credential to
 * carry them.
 */
export async function evaluateRule(
  rule: RouteRule,
  user: { role?: string } | null,
  abilities: AbilityRegistry = {},
  credential?: RuleCredential | null,
): Promise<AuthorizationResponse> {
  if (rule.authenticated === false) return { authorized: true }

  if (!user && !rule.guest) {
    return { authorized: false, statusCode: 401, message: 'Authentication required' }
  }

  if (user && credential && credential.kind !== 'session') {
    const sessionOnly = rule.sessionOnly ?? (!rule.scopes?.length && !!(rule.roles?.length || rule.ability))
    if (sessionOnly) return { authorized: false, statusCode: 403, message: 'Forbidden' }
  }
  // Any credential, a session too: it must carry the scopes, within its user's permissions (role-based access
  // control). A session without access control carries every scope.
  if (user && credential && rule.scopes?.length) {
    if (!holdsScopes(credential.scopes, rule.scopes) || (credential.ceiling && !holdsScopes(credential.ceiling, rule.scopes))) {
      return { authorized: false, statusCode: 403, message: 'Forbidden' }
    }
  }

  if (rule.roles?.length && (!user?.role || !rule.roles.includes(user.role))) {
    return { authorized: false, statusCode: 403, message: 'Forbidden' }
  }

  if (rule.ability) {
    const ability = typeof rule.ability === 'string' ? abilities[rule.ability] : rule.ability
    if (!isAbility(ability)) {
      throw new Error(`[@frigear-nu/authorization] Unknown ability "${String(rule.ability)}". Export it from your abilities file.`)
    }
    const response = normalizeResponse(await (ability as Ability).execute(user, ...(rule.args ?? [])))
    if (!response.authorized) return { statusCode: 403, message: 'Forbidden', ...response }
  }

  return { authorized: true }
}

// A resolver returns a principal (`{ kind, user, scopes }`) or a plain user (a cookie session).
export function splitResolvedUser(resolved: unknown): { user: { role?: string } | null, credential: RuleCredential | null } {
  if (!resolved || typeof resolved !== 'object') return { user: null, credential: null }
  const candidate = resolved as { kind?: unknown, user?: unknown, scopes?: unknown, ceiling?: unknown }
  if (typeof candidate.kind === 'string' && candidate.user && typeof candidate.user === 'object') {
    return {
      user: candidate.user as { role?: string },
      credential: {
        kind: candidate.kind,
        scopes: Array.isArray(candidate.scopes) ? candidate.scopes as string[] : [],
        ...(Array.isArray(candidate.ceiling) ? { ceiling: candidate.ceiling as string[] } : {}),
      },
    }
  }
  return { user: resolved as { role?: string }, credential: null }
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
