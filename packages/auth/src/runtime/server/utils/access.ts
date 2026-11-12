import type { H3Event } from 'h3'
import { apiError } from '@frigear-nu/module-kit/server'
import { namedScopes, registry } from '#auth/permissions'
import { hasProvider, provider, requirements, table } from '#auth/roles'
import type {
  AuthorizationBeforeContext,
  AuthorizationRolesContext,
  AuthPrincipal,
  AuthRoleSource,
  AuthUser,
} from '../../types'
import {
  createBeforeCollector,
  decide,
  expandHeld,
  expandScopes,
  hasPolicyRecord,
  holds,
  precheck,
  resolveEffectiveRoles,
  rolePermissions,
  runSharedPolicies,
  scopeGrantable,
  validatePermissionName,
} from '../../utils/permissions'
// After `../../utils/permissions`: a policy file (`server/policies.ts`) calls `definePolicy` at import time, which needs
// those helpers initialised. The policies themselves are indexed lazily (`policiesOf`), so this file also works when a
// policy file is the first to be loaded and `policies` is not initialised yet while this module evaluates.
import { policies } from '#auth/policies'
import type {
  AccessDto,
  CompiledRole,
  Decision,
  DecisionPrincipal,
  PolicyDefinition,
  PolicyFn,
  PolicyOptions,
  PolicyOutcome,
  SharedPolicyDefinition,
} from '../../utils/permissions'
import type { Permission } from '../../utils/access'
import { getAuth } from './auth'

// The server side of access control: resolves the inputs of the pure `decide` (roles, the `authorization:before`
// hook, policies) for a request. Roles, held permission sets and decisions without a record are cached per request;
// policy results never are.

interface AccessCache {
  roles: Map<string, Promise<ResolvedRoles>>
  granted: Map<string, Promise<string[]>>
  requirements: Map<string, Promise<RequirementResult>>
  /** Decisions without a record for the caller, by permission. */
  decisions: Map<string, Promise<Decision>>
  /** Permissions the caller may delegate (`canGrantScope`), by user id. */
  grantable: Map<string, Promise<Set<string>>>
}

declare module 'h3' {
  interface H3EventContext {
    authAccess?: AccessCache
  }
}

/** Per-request caches; outside a request (`event` missing) nothing is cached. */
function cacheOf(event: H3Event | undefined): AccessCache {
  const fresh = (): AccessCache => ({ roles: new Map(), granted: new Map(), requirements: new Map(), decisions: new Map(), grantable: new Map() })
  if (!event) return fresh()
  return event.context.authAccess ??= fresh()
}

function memo<T>(map: Map<string, Promise<T>>, key: string, run: () => Promise<T>): Promise<T> {
  let pending = map.get(key)
  if (!pending) {
    pending = run()
    map.set(key, pending)
  }
  return pending
}

const idOf = (user: { id: unknown }) => String(user.id)

type AnyPolicy = (PolicyDefinition | SharedPolicyDefinition) & { permission: string }
let policiesByPermission: Map<string, AnyPolicy[]> | undefined

/** The policies of `permission`, indexed on first use (never at import time: see the `#auth/policies` import). */
function policiesOf(permission: string): AnyPolicy[] | undefined {
  if (!policiesByPermission) {
    const index = new Map<string, AnyPolicy[]>()
    for (const policy of policies as AnyPolicy[]) {
      if (!policy || typeof policy.permission !== 'string' || typeof policy.handler !== 'function') continue
      if (import.meta.dev && !Object.hasOwn(registry.permissions, policy.permission)) {
        console.error(`[auth] A policy refines "${policy.permission}", which is not a registered permission: it never runs.`)
      }
      const list = index.get(policy.permission) ?? []
      list.push(policy)
      index.set(policy.permission, list)
    }
    policiesByPermission = index
  }
  return policiesByPermission.get(permission)
}

// ---------------------------------------------------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------------------------------------------------

/** A requirement's answer; `failed` when it threw (treated as not met). */
interface RequirementResult { met: boolean, failed: boolean }

/** A user's roles, and whether resolving them failed (a provider, listener or requirement threw). */
interface ResolvedRoles { roles: string[], failed: boolean }

async function requirementMet(event: H3Event | undefined, user: AuthUser, name: string, value: unknown): Promise<RequirementResult> {
  const requirement = Object.hasOwn(requirements, name) ? requirements[name] : undefined
  if (!requirement) return { met: false, failed: false }
  let key: string
  try {
    key = `${idOf(user)}|${name}|${JSON.stringify(value)}`
  }
  catch {
    key = `${idOf(user)}|${name}|${String(value)}`
  }
  return memo(cacheOf(event).requirements, key, async () => {
    try {
      return { met: (await requirement({ event, user, value })) === true, failed: false }
    }
    catch (error) {
      console.error(`[auth] role requirement "${name}" failed, treating it as not met`, error)
      return { met: false, failed: true }
    }
  })
}

/** Every role reachable from `names` over `inherit` (known roles only). */
function reachable(names: readonly string[]): CompiledRole[] {
  const seen = new Set<string>()
  const queue = [...names]
  const result: CompiledRole[] = []
  while (queue.length) {
    const name = queue.shift()!
    if (seen.has(name) || !Object.hasOwn(table.roles, name)) continue
    seen.add(name)
    const role = table.roles[name]!
    result.push(role)
    queue.push(...role.inherit)
  }
  return result
}

/** Thrown by `getEffectiveRoles(event, user, { strict: true })` when the user's roles could not be resolved. */
export class RoleResolutionError extends Error {
  constructor(userId: string) {
    super(`[auth] the roles of user ${userId} could not be resolved`)
    this.name = 'RoleResolutionError'
  }
}

export interface EffectiveRolesOptions {
  /**
   * Throw `RoleResolutionError` instead of failing closed when the role provider, an `authorization:roles` listener or
   * a role requirement throws. For checks where fewer roles would wrongly pass, such as comparing against what another
   * user holds (target protection): there an empty list is not the safe answer.
   */
  strict?: boolean
}

/**
 * The roles `user` holds: assigned (the role provider) ∪ `defaultRoles` ∪ `auto` roles, then the `authorization:roles`
 * hook (listeners may add or remove), without the roles whose requirements fail, closed over `inherit`. Cached per
 * request. A provider or hook that throws leaves the user without roles (fail closed); `implicit` permissions still
 * apply. With `strict`, any such failure (a requirement that throws too) throws `RoleResolutionError` instead.
 */
export async function getEffectiveRoles(event: H3Event | undefined, user: AuthUser, options: EffectiveRolesOptions = {}): Promise<string[]> {
  const { roles, failed } = await resolveRoles(event, user)
  if (failed && options.strict) throw new RoleResolutionError(idOf(user))
  return roles
}

function resolveRoles(event: H3Event | undefined, user: AuthUser): Promise<ResolvedRoles> {
  return memo(cacheOf(event).roles, idOf(user), async () => {
    let assigned: string[] = []
    if (hasProvider) {
      try {
        assigned = (await provider.getAssignedRoles(event, Number(user.id))).filter(role => typeof role === 'string')
      }
      catch (error) {
        console.error('[auth] the role provider failed, the user holds no assigned roles', error)
        return { roles: [], failed: true }
      }
    }
    const ctx: AuthorizationRolesContext = { event, user, roles: [...new Set([...assigned, ...table.defaultRoles, ...table.autoRoles])] }
    try {
      await useNitroApp().hooks.callHook('authorization:roles', ctx)
    }
    catch (error) {
      console.error('[auth] an authorization:roles listener failed, the user holds no roles', error)
      return { roles: [], failed: true }
    }
    const candidates = Array.isArray(ctx.roles) ? ctx.roles.filter(role => typeof role === 'string') : []
    const met = new Map<string, boolean>()
    let failed = false
    for (const role of reachable(candidates)) {
      const entries = Object.entries(role.requirements)
      if (!entries.length) continue
      let ok = true
      for (const [name, value] of entries) {
        const result = await requirementMet(event, user, name, value)
        if (result.failed) failed = true
        if (!result.met) {
          ok = false
          break
        }
      }
      met.set(role.name, ok)
    }
    // The hook's list is final: defaults and `auto` roles were in it already, and a listener may have removed them.
    const { roles, unknown } = resolveEffectiveRoles({
      table: { ...table, defaultRoles: [], autoRoles: [] },
      assigned: candidates,
      requirementsMet: role => met.get(role.name) ?? false,
    })
    if (import.meta.dev && unknown.length) console.warn(`[auth] user ${idOf(user)} holds roles that are not configured (ignored): ${unknown.join(', ')}`)
    return { roles, failed }
  })
}

/**
 * Stores `userId`'s roles of one `source` through the role provider (single sign-on passes `sso`, which never touches
 * manually assigned roles). Without a provider (no `@frigear-nu/authorization`) it does nothing.
 */
export async function setAuthUserRoles(userId: number, roles: string[], options: { source: AuthRoleSource, grantedBy?: number }): Promise<void> {
  if (!hasProvider) return
  await provider.setRoles(userId, [...new Set(roles)], options)
}

/** What `user`'s roles grant (as configured, wildcards included) plus the `implicit` permissions. Cached per request. */
export function getUserGrants(event: H3Event | undefined, user: AuthUser): Promise<string[]> {
  return memo(cacheOf(event).granted, idOf(user), async () => rolePermissions(await getEffectiveRoles(event, user), table, registry))
}

/** Every registered permission `user`'s roles (and `implicit`) cover, without hooks or policies (sorted). */
export async function getUserPermissions(event: H3Event | undefined, user: AuthUser): Promise<string[]> {
  return expandHeld(await getUserGrants(event, user), registry)
}

/**
 * A bearer credential's permissions: `principal.permissions` when frozen at issue, otherwise its scopes expanded
 * (named scopes, wildcards, aliases) and intersected with its user's permissions now.
 */
export async function resolveCredentialPermissions(event: H3Event, principal: AuthPrincipal): Promise<string[]> {
  if (Array.isArray(principal.permissions)) return principal.permissions
  const held = new Set(await getUserPermissions(event, principal.user))
  return expandScopes(principal.scopes, registry, namedScopes).filter(permission => held.has(permission))
}

// ---------------------------------------------------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------------------------------------------------

const toDecisionPrincipal = (principal: AuthPrincipal | null): DecisionPrincipal | null => principal
  ? { kind: principal.kind, permissions: principal.permissions, foreign: principal.foreign }
  : null

async function runBefore(event: H3Event, principal: AuthPrincipal, permission: string, record: unknown) {
  const collector = createBeforeCollector()
  const ctx: AuthorizationBeforeContext = {
    event,
    principal,
    user: principal.user,
    permission,
    record,
    allow: collector.allow,
    deny: collector.deny,
  }
  try {
    await useNitroApp().hooks.callHook('authorization:before', ctx)
  }
  catch (error) {
    console.error(`[auth] an authorization:before listener failed for "${permission}", denying`, error)
    collector.fail()
  }
  return collector.votes
}

async function runPolicies(event: H3Event, principal: AuthPrincipal, permission: string, record: unknown, withRecord: boolean): Promise<PolicyOutcome[]> {
  const list = policiesOf(permission)
  if (!list?.length) return []
  const outcomes: PolicyOutcome[] = []
  for (const policy of list) {
    if (!withRecord && !policy.withoutRecord) continue
    if ((policy as SharedPolicyDefinition).shared) {
      const access = await serverSharedAccess(event, principal)
      outcomes.push(...runSharedPolicies([policy as SharedPolicyDefinition], { user: principal.user, access, record: withRecord ? record : undefined, granted: true }))
    }
    else {
      try {
        const result: unknown = await (policy as PolicyDefinition).handler({ event, user: principal.user, principal, record: withRecord ? record : undefined, granted: true })
        outcomes.push({ result: result === true || result === false || result === undefined ? result : 'throw', withoutRecord: policy.withoutRecord })
      }
      catch (error) {
        console.error(`[auth] a policy of "${permission}" failed, denying`, error)
        outcomes.push({ result: 'throw', withoutRecord: policy.withoutRecord })
      }
    }
    // Any false denies: the rest cannot change that.
    const last = outcomes.at(-1)
    if (last?.result === false || last?.result === 'throw') break
  }
  return outcomes
}

/**
 * The `access` a shared policy sees on the server: the caller's role permissions (no hook, no policies, so evaluating
 * it never recurses into policies). The client's `access` comes from `GET /api/auth/me/access`.
 */
async function serverSharedAccess(event: H3Event, principal: AuthPrincipal): Promise<AccessDto> {
  const permissions = principal.kind === 'session'
    ? await getUserPermissions(event, principal.user)
    : principal.foreign ? [...(principal.permissions ?? [])] : (await getUserPermissions(event, principal.user)).filter(p => principal.permissions?.includes(p))
  return { kind: principal.kind, scopes: principal.kind === 'session' ? [] : [...principal.scopes], permissions }
}

async function evaluate(event: H3Event, principal: AuthPrincipal | null, permission: string, record: unknown, options: { policies: boolean }): Promise<Decision> {
  const decisionPrincipal = toDecisionPrincipal(principal)
  const early = precheck(permission, registry, decisionPrincipal)
  if (early) {
    if (early.via === 'registry' && import.meta.dev) console.error(`[auth] "${permission}" is not a registered permission: denied (register it with addPermission).`)
    return early
  }
  const before = await runBefore(event, principal!, permission, record)
  const base = { permission, registry, principal: decisionPrincipal, before }
  const quick = decide(base)
  // Before decided, or nothing granted at all: policies cannot change that.
  if (quick.via === 'before') return quick
  const granted = principal!.foreign ? [] : await getUserGrants(event, principal!.user)
  const held = principal!.foreign ? principal!.permissions ?? [] : granted
  if (!holds(held, permission, registry) || !options.policies) return decide({ ...base, granted })
  const withRecord = hasPolicyRecord(record)
  const outcomes = await runPolicies(event, principal!, permission, record, withRecord)
  return decide({ ...base, granted, hasRecord: withRecord, policies: outcomes })
}

/**
 * The full decision for the caller, with which step decided (`via`). Never throws on denial. A check without a record
 * is cached per request; one with a record runs the policies every time.
 */
export async function inspect(event: H3Event, permission: Permission, record?: unknown): Promise<Decision> {
  if (hasPolicyRecord(record)) return evaluate(event, await getAuth(event), permission, record, { policies: true })
  return memo(cacheOf(event).decisions, permission, async () => evaluate(event, await getAuth(event), permission, undefined, { policies: true }))
}

/** Whether the caller may do `permission` (to `record`). */
export async function allows(event: H3Event, permission: Permission, record?: unknown): Promise<boolean> {
  return (await inspect(event, permission, record)).allowed
}

/** Whether the caller may not do `permission` (to `record`). */
export async function denies(event: H3Event, permission: Permission, record?: unknown): Promise<boolean> {
  return !(await allows(event, permission, record))
}

/** The 401/403 a denial answers with: the code in `data.code` (and `data.error`, kept for existing clients). */
export function authAccessError(event: H3Event, decision: Decision & { allowed: false }, permission: string) {
  if (decision.status === 401) {
    setResponseHeader(event, 'www-authenticate', event.context.authRejected ? 'Bearer error="invalid_token"' : 'Bearer')
    return apiError(401, 'unauthorized', 'Unauthorized')
  }
  if (decision.code === 'insufficient_scope') {
    setResponseHeader(event, 'www-authenticate', `Bearer error="insufficient_scope", scope="${permission}"`)
    return apiError(403, 'insufficient_scope', 'Forbidden', { error: 'insufficient_scope', scopes: [permission] })
  }
  if (decision.code === 'session_required') return apiError(403, 'session_required', 'Forbidden', { error: 'session_required' })
  return apiError(403, 'forbidden', 'You are not allowed to do that.', { error: 'forbidden', permission })
}

/**
 * Authorizes the caller for `permission` (and `record`, for its policies) and returns the principal. Throws 401
 * `unauthorized`, or 403 `session_required` / `insufficient_scope` / `forbidden`. Call it without the record before
 * loading it (so a 404 never answers before a 401/403), then with it:
 *
 *     await authorize(event, 'events:update')
 *     const ev = await loadEvent(id)
 *     await authorize(event, 'events:update', ev)
 */
export async function authorize(event: H3Event, permission: Permission, record?: unknown): Promise<AuthPrincipal> {
  const decision = await inspect(event, permission, record)
  if (!decision.allowed) throw authAccessError(event, decision, permission)
  return (await getAuth(event))!
}

/**
 * Whether ANOTHER user (`userId`) holds `permission`: their roles and the `authorization:before` hook (as their own
 * session), no policies. For role assignment and target protection only; check the caller with `allows`.
 */
export async function userCan(event: H3Event, userId: number | string, permission: Permission): Promise<boolean> {
  if (!Object.hasOwn(registry.permissions, permission)) return false
  const user = await loadAuthUser(userId)
  return !!user && subjectAllowed(event, user, permission)
}

/**
 * Whether `user` holds `permission` as their own session would, without policies and without the per-request decision
 * cache (so an `authorization:before` listener may call it without waiting on itself).
 */
export async function subjectAllowed(event: H3Event, user: AuthUser, permission: string): Promise<boolean> {
  return (await evaluate(event, { kind: 'session', user, scopes: [] }, permission, undefined, { policies: false })).allowed
}

/**
 * The permissions `user` may delegate to a token or a client: each passes `authorization:before` and the roles with
 * session semantics, no policies. Cached per request.
 */
function grantableFor(event: H3Event, user: AuthUser): Promise<Set<string>> {
  return memo(cacheOf(event).grantable, idOf(user), async () => {
    const principal: AuthPrincipal = { kind: 'session', user, scopes: [] }
    const result = new Set<string>()
    for (const definition of Object.values(registry.permissions)) {
      if (definition.sessionOnly) continue
      if ((await evaluate(event, principal, definition.name, undefined, { policies: false })).allowed) result.add(definition.name)
    }
    return result
  })
}

export interface CanGrantScopeOptions {
  /** The user who delegates. Defaults to the caller, who must then be a cookie session. */
  user?: AuthUser
  /** Whether wildcard scopes (`*`, `resource:*`) may be given. Defaults to `false`; user API tokens allow them. */
  wildcardScopes?: boolean
  /** `oauthServer.settings.roleScopes`: the most each role may grant. Unset: no cap beyond permissions. */
  roleScopes?: Readonly<Record<string, readonly string[]>>
}

/**
 * Whether the caller may give `scope` to a token or an OAuth client: it is a known scope, within the `roleScopes` cap,
 * a wildcard only when allowed, and every permission it expands to passes `authorization:before` + roles (no policies).
 */
export async function canGrantScope(event: H3Event, scope: string, options: CanGrantScopeOptions = {}): Promise<boolean> {
  let user = options.user
  if (!user) {
    const principal = await getAuth(event)
    if (!principal || principal.kind !== 'session') return false
    user = principal.user
  }
  const grantable = await grantableFor(event, user)
  return scopeGrantable(scope, {
    registry,
    namedScopes,
    canGrant: permission => grantable.has(permission),
    roles: options.roleScopes ? await getEffectiveRoles(event, user) : [],
    roleScopes: options.roleScopes,
    wildcardScopes: options.wildcardScopes ?? false,
  })
}

/** The permissions `scopes` expand to that the caller may delegate: what a new credential freezes (sorted). */
export async function grantedScopePermissions(event: H3Event, scopes: readonly string[], user: AuthUser): Promise<string[]> {
  const grantable = await grantableFor(event, user)
  return expandScopes(scopes, registry, namedScopes).filter(permission => grantable.has(permission))
}

/**
 * What the caller may do, for clients (`GET /api/auth/me/access`): the credential kind, its scopes (none for a
 * session), every registered permission a check without a record allows, and the effective roles for a session or a
 * token with the `profile` scope. `null` when nobody is signed in.
 */
export async function getAccess(event: H3Event): Promise<AccessDto | null> {
  const principal = await getAuth(event)
  if (!principal) return null
  const permissions: string[] = []
  for (const name of Object.keys(registry.permissions).sort()) {
    if (await allows(event, name as Permission)) permissions.push(name)
  }
  const dto: AccessDto = { kind: principal.kind, scopes: principal.kind === 'session' ? [] : [...principal.scopes], permissions }
  if (!principal.foreign && (principal.kind === 'session' || principal.scopes.includes('profile'))) dto.roles = await getEffectiveRoles(event, principal.user)
  return dto
}

/**
 * Defines a server policy: it refines `permission` against a record. Return `false` to deny, `true` or `undefined` to
 * keep the result; throwing denies. It never grants: it only runs once the roles (or a foreign token) hold the
 * permission, and never after `authorization:before` allowed. Runs only for checks with a record unless
 * `withoutRecord`. Export it from a file registered with `addPolicies` (the host's `server/policies.ts`).
 */
export function definePolicy<R = unknown>(
  permission: Permission,
  handler: PolicyFn<R, H3Event, AuthUser, AuthPrincipal>,
  options: PolicyOptions = {},
): PolicyDefinition<R, H3Event, AuthUser, AuthPrincipal> {
  const invalid = validatePermissionName(permission)
  if (invalid) throw new Error(`[auth] definePolicy: ${invalid}`)
  return { permission, handler, withoutRecord: options.withoutRecord ?? false }
}
