import { isAbility } from './ability'
import { normalizeResponse } from './bouncer'
import type { Ability, AuthorizationResponse, AuthorizeMeta, RouteRule } from './types'

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

/** How specific a pattern is - more literal segments win, and an exact pattern beats a trailing `/**`. */
function specificity(pattern: string): number {
  const segments = pattern.split('/').filter(Boolean)
  const literals = segments.filter(segment => segment !== '*' && segment !== '**').length
  return literals * 10 + (pattern.endsWith('/**') ? 0 : 5)
}

/**
 * Resolve the rule for a path from `routeRules`-style entries. Like Nitro's route rules, the most specific
 * matching pattern wins; `false` switches authorization off for that path (e.g. to open up a sub-route).
 * `true` means "any logged-in user".
 */
export function resolveRule(routes: Record<string, RouteRule | boolean> | undefined, path: string): RouteRule | undefined {
  const [, match] = Object.entries(routes ?? {})
    .filter(([pattern]) => matchRoute(pattern, path))
    .map(([pattern, rule]) => [specificity(pattern), rule] as const)
    .sort(([a], [b]) => b - a)[0] ?? []
  if (match === undefined || match === false) return undefined
  return match === true ? {} : match
}

export function normalizeAuthorizeMeta(meta: AuthorizeMeta): RouteRule {
  if (typeof meta === 'string') return { ability: meta }
  if (isAbility(meta)) return { ability: meta }
  return meta
}

/**
 * Evaluate a declarative route rule for an already-resolved user.
 * Unauthenticated visitors get 401 (unless `guest` is set), role/ability mismatches get 403.
 */
export async function evaluateRule(
  rule: RouteRule,
  user: { role?: string } | null,
  abilities: AbilityRegistry = {},
): Promise<AuthorizationResponse> {
  if (!user && !rule.guest) {
    return { authorized: false, statusCode: 401, message: 'Authentication required' }
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
