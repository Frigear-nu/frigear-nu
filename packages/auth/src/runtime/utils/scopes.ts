/** Full access: what a session carries without access control (`auth:user-permissions`). */
export const ALL_SCOPES = '*'

/** Suffix of scopes that expose personal data of other people. They are never covered by a wildcard. */
const PII_SUFFIX = ':pii'

/** Whether `scope` is a personal-data scope (`events:pii`), which must be granted explicitly. */
export function isPiiScope(scope: string): boolean {
  return scope.endsWith(PII_SUFFIX)
}

/**
 * Whether `granted` covers `required`.
 * `*` covers everything and `resource:*` covers every `resource:<action>`, except personal-data
 * scopes (`*:pii`): those only count when granted by name.
 */
export function hasScope(granted: readonly string[], required: string): boolean {
  if (isPiiScope(required)) return granted.includes(required)
  if (granted.includes(ALL_SCOPES) || granted.includes(required)) return true
  const separator = required.indexOf(':')
  return separator > 0 && granted.includes(`${required.slice(0, separator)}:*`)
}

export function hasScopes(granted: readonly string[], required: readonly string[]): boolean {
  return required.every(scope => hasScope(granted, scope))
}

/**
 * Whether a credential covers `required`: its `scopes` must, and so must a bearer's `permissions` (frozen at issue, or
 * its scopes within its user's permissions). A session's `scopes` are its user's held grants.
 * @deprecated — removed in phase 2. Use `allows(event, permission)`, which also runs `authorization:before` and policies.
 */
export function principalHasScopes(principal: { scopes: readonly string[], permissions?: readonly string[] }, required: readonly string[]): boolean {
  return hasScopes(principal.scopes, required) && (!principal.permissions || required.every(scope => principal.permissions!.includes(scope)))
}

export { parseScopeString } from './permissions'

/**
 * Whether a token may be granted `scope`: full access, a registered scope, or the wildcard of a
 * resource that has registered scopes (`events:*` when `events:read` exists).
 */
export function isGrantableScope(scope: string, registered: readonly string[]): boolean {
  if (scope === ALL_SCOPES || registered.includes(scope)) return true
  if (!scope.endsWith(':*')) return false
  const resource = scope.slice(0, -2)
  return resource.length > 0 && registered.some(name => name.startsWith(`${resource}:`))
}
