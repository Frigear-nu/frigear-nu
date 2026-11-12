/**
 * The access-control vocabulary and its pure decision core.
 *
 * - A **permission** is a `resource:action` string, registered by modules or the host. It is the only thing code checks.
 * - A **role** is a named bundle of permissions (`grant`), other roles (`inherit`), `requirements` and `auto`.
 * - A **scope** is what a delegated credential may do: a permission, a wildcard, or a named scope that expands to
 *   permissions (`tickets` -> `tickets:read`, `tickets:write`) or to nothing (`openid`).
 * - A **policy** refines one permission against a record. It can deny, never grant.
 *
 * Everything here is framework-free (no Nuxt, Vue or h3), so the same rules run at build time, on the server, in the
 * client and on resource servers. The server wrapper (`authorize`, `inspect`, ...) resolves the inputs (the hook, the
 * roles, the policies) and hands them to `decide`.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------------------------------------------------

/** Every permission, held by `*`. Never covers a sensitive permission. */
export const ANY_PERMISSION = '*'

/** Suffix of permissions that expose other people's personal data: sensitive by default. */
const PII_SUFFIX = ':pii'

const SEGMENT = '[a-z0-9][a-z0-9._-]*'
const PERMISSION_PATTERN = new RegExp(`^${SEGMENT}:${SEGMENT}$`)
const NAMED_SCOPE_PATTERN = new RegExp(`^${SEGMENT}$`)

export interface PermissionDefinition {
  /** `resource:action`, lower case (`events:update`, `member-area:view`). */
  name: string
  label?: string
  labelKey?: string
  description?: string
  descriptionKey?: string
  /** Groups permissions in admin views; defaults to the resource. */
  group?: string
  /** Never covered by a wildcard (`*`, `resource:*`): only held when granted by name. Defaults to `true` for `:pii`. */
  sensitive?: boolean
  /** Only a cookie session may use it: never held by an API token or an OAuth token, never offered as a scope. */
  sessionOnly?: boolean
  /** Held by every signed-in user, also without `@frigear-nu/authorization` (self-service: `tickets:read`). */
  implicit?: boolean
  /** Old names that, when held, also hold this permission. Expanded on the held side only. */
  aliases?: string[]
}

/** A registered permission with its defaults applied. */
export interface ResolvedPermission {
  name: string
  resource: string
  label?: string
  labelKey?: string
  description?: string
  descriptionKey?: string
  group: string
  sensitive: boolean
  sessionOnly: boolean
  implicit: boolean
  aliases: string[]
}

export interface PermissionRegistry {
  /** Registered permissions by name. */
  permissions: Record<string, ResolvedPermission>
  /** Alias -> the permissions it expands to (an old name may split into several). */
  aliases: Record<string, string[]>
}

export interface BuildResult<T> {
  value: T
  /** Human-readable build errors. A module throws when there are any. */
  errors: string[]
}

/** An own entry of a lookup table, so runtime strings like `constructor` never resolve to `Object.prototype` members. */
function own<T>(table: Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  return table && Object.hasOwn(table, key) ? table[key] : undefined
}

/** The resource part of `resource:action`. */
export function permissionResource(permission: string): string {
  const separator = permission.indexOf(':')
  return separator > 0 ? permission.slice(0, separator) : permission
}

export function isWildcard(value: string): boolean {
  return value === ANY_PERMISSION || value.endsWith(':*')
}

/** `null` when `name` is a valid `resource:action` permission name, otherwise why not. */
export function validatePermissionName(name: string): string | null {
  if (typeof name !== 'string' || !name) return 'a permission name must be a non-empty string'
  if (name.includes('*')) return `"${name}" is a wildcard, not a permission name`
  if (!PERMISSION_PATTERN.test(name)) return `"${name}" is not a \`resource:action\` permission name (lower case, one colon)`
  return null
}

/** `null` when `grant` is a valid role grant or permission scope (`*`, `resource:*` or a permission name). */
export function validateGrant(grant: string): string | null {
  if (grant === ANY_PERMISSION) return null
  if (grant.endsWith(':*')) {
    return NAMED_SCOPE_PATTERN.test(grant.slice(0, -2)) ? null : `"${grant}" is not a valid \`resource:*\` wildcard`
  }
  return validatePermissionName(grant)
}

/** Applies the defaults of a definition (`sensitive` for `:pii`, `group` from the resource). */
export function resolvePermission(definition: PermissionDefinition): ResolvedPermission {
  const resource = permissionResource(definition.name)
  return {
    name: definition.name,
    resource,
    label: definition.label,
    labelKey: definition.labelKey,
    description: definition.description,
    descriptionKey: definition.descriptionKey,
    group: definition.group ?? resource,
    sensitive: definition.sensitive ?? definition.name.endsWith(PII_SUFFIX),
    sessionOnly: definition.sessionOnly ?? false,
    implicit: definition.implicit ?? false,
    aliases: [...new Set(definition.aliases ?? [])],
  }
}

const CONFLICT_KEYS = ['sensitive', 'sessionOnly', 'implicit'] as const

/**
 * Merges permission definitions into a registry. The same name may be registered twice (a module and the host) as long
 * as the security-relevant fields agree; labels of a later definition win.
 */
export function createPermissionRegistry(definitions: readonly PermissionDefinition[]): BuildResult<PermissionRegistry> {
  const errors: string[] = []
  const permissions: Record<string, ResolvedPermission> = {}
  for (const definition of definitions) {
    const invalid = validatePermissionName(definition.name)
    if (invalid) {
      errors.push(`Invalid permission: ${invalid}.`)
      continue
    }
    const next = resolvePermission(definition)
    const previous = own(permissions, next.name)
    if (previous) {
      const conflict = CONFLICT_KEYS.find(key => previous[key] !== next[key])
      if (conflict) {
        errors.push(`Permission "${next.name}" is registered twice with a different \`${conflict}\`.`)
        continue
      }
      permissions[next.name] = {
        ...previous,
        ...Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined)),
        // The resource is only a default group: keep an explicit group unless this definition names one.
        group: definition.group ?? previous.group,
        aliases: [...new Set([...previous.aliases, ...next.aliases])],
      } as ResolvedPermission
      continue
    }
    permissions[next.name] = next
  }

  const aliases: Record<string, string[]> = {}
  for (const permission of Object.values(permissions)) {
    for (const alias of permission.aliases) {
      const invalid = validatePermissionName(alias)
      if (invalid) errors.push(`Invalid alias of "${permission.name}": ${invalid}.`)
      else if (own(permissions, alias)) errors.push(`Alias "${alias}" of "${permission.name}" is itself a registered permission.`)
      else (aliases[alias] ??= []).push(permission.name)
    }
  }
  for (const targets of Object.values(aliases)) targets.sort()
  return { value: { permissions, aliases }, errors }
}

export function isKnownPermission(name: string, registry: PermissionRegistry): boolean {
  return Object.hasOwn(registry.permissions, name)
}

/** The permissions every signed-in user holds (`implicit`). */
export function implicitPermissions(registry: PermissionRegistry): string[] {
  return Object.values(registry.permissions).filter(p => p.implicit).map(p => p.name).sort()
}

/**
 * Whether one held grant covers `permission`: by name, or by a wildcard (`*`, `resource:*`) unless the permission is
 * sensitive. Without a definition, `:pii` permissions count as sensitive. Aliases are not considered here (`holds`).
 */
export function matches(held: string, permission: string, definition?: Pick<ResolvedPermission, 'sensitive'>): boolean {
  if (held === permission) return true
  const sensitive = definition?.sensitive ?? permission.endsWith(PII_SUFFIX)
  if (sensitive) return false
  if (held === ANY_PERMISSION) return true
  return held === `${permissionResource(permission)}:*` && permission.includes(':')
}

/**
 * Whether a held list (role grants, a token's frozen permissions) covers a registered `permission`. Unknown
 * permissions are never held (fail closed). Aliases expand on the held side only: holding the old name `events:manage`
 * holds what it was split into, while checking for `events:manage` (no longer registered) fails.
 */
export function holds(held: readonly string[], permission: string, registry: PermissionRegistry): boolean {
  const definition = own(registry.permissions, permission)
  if (!definition) return false
  for (const grant of held) {
    if (matches(grant, permission, definition)) return true
    if (own(registry.aliases, grant)?.includes(permission)) return true
  }
  return false
}

/** Every registered permission a held list covers (concrete names, sorted). */
export function expandHeld(held: readonly string[], registry: PermissionRegistry): string[] {
  return Object.keys(registry.permissions).filter(name => holds(held, name, registry)).sort()
}

// ---------------------------------------------------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------------------------------------------------

/** A named scope: a group of permissions under one name (`tickets`), or none (`openid`). */
export interface ScopeDefinition {
  name: string
  label?: string
  labelKey?: string
  description?: string
  descriptionKey?: string
  icon?: string
  /** Permission names or wildcards. Never sensitive or `sessionOnly` permissions. */
  permissions?: string[]
  /** Bumped when `permissions` grows, so users are asked to consent again. */
  version?: number
}

export type NamedScopes = Readonly<Record<string, ScopeDefinition>>

/** Splits an OAuth `scope` string into unique, non-empty scopes. */
export function parseScopeString(scope: string | undefined | null): string[] {
  return [...new Set((scope ?? '').split(/\s+/).filter(Boolean))]
}

/** The permissions a delegated credential may ever hold: registered, not `sessionOnly`. */
function delegable(registry: PermissionRegistry): ResolvedPermission[] {
  return Object.values(registry.permissions).filter(p => !p.sessionOnly)
}

/** Whether `scope` names something: a named scope, a permission (or alias) a token may hold, or a wildcard covering one. */
export function isKnownScope(scope: string, registry: PermissionRegistry, namedScopes: NamedScopes = {}): boolean {
  if (Object.hasOwn(namedScopes, scope)) return true
  const targets = own(registry.aliases, scope)
  if (targets) return targets.some(name => !registry.permissions[name]!.sessionOnly)
  if (isWildcard(scope)) return validateGrant(scope) === null && delegable(registry).some(p => matches(scope, p.name, p))
  const definition = own(registry.permissions, scope)
  return !!definition && !definition.sessionOnly
}

/**
 * The concrete permissions a set of scopes stands for, sorted. Named scopes expand to their permissions, aliases to
 * their targets, wildcards to every non-sensitive permission they cover. `sessionOnly` permissions and unknown scopes
 * expand to nothing. This is what a token's `permissions` claim freezes (intersected with its user's permissions).
 */
export function expandScopes(scopes: readonly string[], registry: PermissionRegistry, namedScopes: NamedScopes = {}): string[] {
  const held: string[] = []
  for (const scope of scopes) {
    const named = own(namedScopes, scope)
    if (named) held.push(...(named.permissions ?? []))
    else held.push(scope)
  }
  return delegable(registry).map(p => p.name).filter(name => holds(held, name, registry)).sort()
}

/** Build errors of named scopes: invalid names, unknown, sensitive or `sessionOnly` permissions. */
export function validateNamedScopes(namedScopes: NamedScopes, registry: PermissionRegistry): string[] {
  const errors: string[] = []
  for (const [key, scope] of Object.entries(namedScopes)) {
    if (scope.name !== key) errors.push(`Scope "${key}" is registered under a different name ("${scope.name}").`)
    if (!NAMED_SCOPE_PATTERN.test(key)) errors.push(`Scope "${key}" must be a single lower-case word without a colon.`)
    for (const permission of scope.permissions ?? []) {
      const invalid = validateGrant(permission)
      if (invalid) {
        errors.push(`Scope "${key}": ${invalid}.`)
        continue
      }
      // An alias stands for its targets, so it is checked like them.
      const definitions = (own(registry.aliases, permission) ?? [permission]).map(name => own(registry.permissions, name))
      if (definitions.some(definition => definition?.sensitive)) errors.push(`Scope "${key}" may not contain the sensitive permission "${permission}".`)
      else if (definitions.some(definition => definition?.sessionOnly)) errors.push(`Scope "${key}" may not contain the session-only permission "${permission}".`)
      else if (!expandScopes([permission], registry).length) {
        errors.push(`Scope "${key}" grants "${permission}", which matches no permission a token may hold.`)
      }
    }
  }
  return errors
}

// ---------------------------------------------------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------------------------------------------------

export interface RoleDefinition {
  label?: string
  labelKey?: string
  description?: string
  descriptionKey?: string
  /** Permission names or wildcards. `*` never covers sensitive permissions: grant those by name. */
  grant?: string[]
  /** Roles whose permissions this role also holds. */
  inherit?: string[]
  /** Requirement name -> value; the role only counts while every requirement holds (`{ subscription: '*' }`). */
  requirements?: Record<string, unknown>
  /** Held by everyone who meets the requirements; never assigned, never in `defaultRoles`. */
  auto?: boolean
  /** Whether admins may assign it. Defaults to `true`, and is always `false` for `auto` and default roles. */
  assignable?: boolean
}

export interface CompiledRole {
  name: string
  label: string
  labelKey?: string
  description?: string
  descriptionKey?: string
  /** The role's own grants, as configured. */
  grant: string[]
  /** Direct parents. */
  inherit: string[]
  /** Every role this one inherits, transitively, without itself (sorted). */
  inherited: string[]
  /** Every registered permission the role and the roles it inherits hold, ignoring requirements (sorted). */
  permissions: string[]
  requirements: Record<string, unknown>
  auto: boolean
  /** A default role (`defaultRoles`): every signed-in user holds it. */
  default: boolean
  assignable: boolean
}

export interface RoleTable {
  roles: Record<string, CompiledRole>
  defaultRoles: string[]
  /** Roles held by everyone meeting their requirements. */
  autoRoles: string[]
}

export interface CompileRolesInput {
  roles: Readonly<Record<string, RoleDefinition>>
  defaultRoles?: readonly string[]
  registry: PermissionRegistry
  /** Names of the registered role requirements (`addRoleRequirement`). */
  requirementNames?: readonly string[]
}

/** Builds the role table and reports every configuration error at once. */
export function compileRoles(input: CompileRolesInput): BuildResult<RoleTable> {
  const { registry } = input
  const errors: string[] = []
  const requirementNames = new Set(input.requirementNames ?? [])
  const defaultRoles = [...new Set(input.defaultRoles ?? [])]
  const names = Object.keys(input.roles)

  for (const name of defaultRoles) {
    if (!Object.hasOwn(input.roles, name)) errors.push(`Default role "${name}" is not defined.`)
    else if (input.roles[name]!.auto) errors.push(`Role "${name}" is \`auto\` and cannot be a default role.`)
  }

  for (const name of names) {
    const role = input.roles[name]!
    if (!NAMED_SCOPE_PATTERN.test(name)) errors.push(`Role name "${name}" must be lower case without a colon.`)
    for (const grant of role.grant ?? []) {
      const invalid = validateGrant(grant)
      if (invalid) errors.push(`Role "${name}": ${invalid}.`)
      else if (isWildcard(grant) ? !expandHeld([grant], registry).length : !isKnownPermission(grant, registry) && !own(registry.aliases, grant)) {
        errors.push(`Role "${name}" grants "${grant}", which ${isWildcard(grant) ? 'matches no' : 'is not a'} registered permission.`)
      }
    }
    for (const parent of role.inherit ?? []) {
      if (!Object.hasOwn(input.roles, parent)) errors.push(`Role "${name}" inherits "${parent}", which is not defined.`)
    }
    for (const requirement of Object.keys(role.requirements ?? {})) {
      if (!requirementNames.has(requirement)) errors.push(`Role "${name}" has the unknown requirement "${requirement}".`)
    }
  }

  // Inheritance closure, reporting each cycle once.
  const closures: Record<string, string[]> = {}
  const reportedCycles = new Set<string>()
  const visit = (name: string, path: string[]): Set<string> => {
    const result = new Set<string>()
    for (const parent of input.roles[name]?.inherit ?? []) {
      if (!Object.hasOwn(input.roles, parent)) continue
      if (parent === path[0] || path.includes(parent)) {
        const cycle = [...path.slice(path.indexOf(parent)), parent]
        const key = [...new Set(cycle)].sort().join(',')
        if (!reportedCycles.has(key)) {
          reportedCycles.add(key)
          errors.push(`Roles inherit in a cycle: ${cycle.join(' -> ')}.`)
        }
        continue
      }
      result.add(parent)
      for (const ancestor of visit(parent, [...path, parent])) result.add(ancestor)
    }
    return result
  }
  for (const name of names) {
    const closure = visit(name, [name])
    closure.delete(name)
    closures[name] = [...closure].sort()
  }

  const roles: Record<string, CompiledRole> = {}
  for (const name of names) {
    const role = input.roles[name]!
    const isDefault = defaultRoles.includes(name)
    const auto = role.auto ?? false
    const grants = [name, ...closures[name]!].flatMap(member => input.roles[member]?.grant ?? [])
    roles[name] = {
      name,
      label: role.label ?? name,
      labelKey: role.labelKey,
      description: role.description,
      descriptionKey: role.descriptionKey,
      grant: [...(role.grant ?? [])],
      inherit: [...(role.inherit ?? [])],
      inherited: closures[name]!,
      permissions: expandHeld(grants, registry),
      requirements: { ...role.requirements },
      auto,
      default: isDefault,
      assignable: !auto && !isDefault && (role.assignable ?? true),
    }
  }

  return {
    value: {
      roles,
      defaultRoles: defaultRoles.filter(name => Object.hasOwn(roles, name)),
      autoRoles: names.filter(name => roles[name]!.auto),
    },
    errors,
  }
}

export interface EffectiveRolesInput {
  table: RoleTable
  /** Roles stored for the user (assigned or migrated). Unknown names are ignored and reported. */
  assigned: readonly string[]
  /** Roles added by the `authorization:roles` hook. */
  extra?: readonly string[]
  /** Whether every requirement of a role holds for the user. A requirement that threw counts as not met. */
  requirementsMet: (role: CompiledRole) => boolean
}

export interface EffectiveRoles {
  /** The roles the user holds, inheritance included (sorted). */
  roles: string[]
  /** Names that are not configured roles: kept in storage, ignored at runtime. */
  unknown: string[]
}

/**
 * The roles a user holds: assigned ∪ default ∪ auto ∪ hook roles, without the roles whose requirements fail, closed
 * over `inherit`. Requirements apply to inherited roles too, so inheriting a gated role never bypasses its gate.
 */
export function resolveEffectiveRoles(input: EffectiveRolesInput): EffectiveRoles {
  const { table } = input
  const unknown = new Set<string>()
  const queue = [...input.assigned, ...table.defaultRoles, ...table.autoRoles, ...(input.extra ?? [])]
  const held = new Set<string>()
  const checked = new Map<string, boolean>()
  while (queue.length) {
    const name = queue.shift()!
    if (held.has(name)) continue
    const role = own(table.roles, name)
    if (!role) {
      unknown.add(name)
      continue
    }
    if (!checked.has(name)) {
      let met: boolean
      try {
        met = Object.keys(role.requirements).length === 0 || input.requirementsMet(role)
      }
      catch {
        met = false
      }
      checked.set(name, met)
    }
    if (!checked.get(name)) continue
    held.add(name)
    queue.push(...role.inherit)
  }
  return { roles: [...held].sort(), unknown: [...unknown].sort() }
}

/** The held list (grants, as configured) of a set of effective roles, plus the implicit permissions. */
export function rolePermissions(roles: readonly string[], table: RoleTable, registry: PermissionRegistry): string[] {
  const held = new Set(implicitPermissions(registry))
  for (const name of roles) for (const grant of own(table.roles, name)?.grant ?? []) held.add(grant)
  return [...held].sort()
}

/** Build errors of `oauthServer.settings.roleScopes`: role names that are not configured. */
export function validateRoleScopes(roleScopes: Readonly<Record<string, readonly string[]>>, table: RoleTable): string[] {
  return Object.keys(roleScopes)
    .filter(name => !Object.hasOwn(table.roles, name))
    .map(name => `\`roleScopes\` lists "${name}", which is not a configured role.`)
}

// ---------------------------------------------------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------------------------------------------------

export type PrincipalKind = 'session' | 'user-token' | 'oauth'

export type DecisionCode = 'unauthorized' | 'session_required' | 'insufficient_scope' | 'forbidden'

/** Which step decided. `registry` and `credential` are the fail-closed steps 1-4. */
export type DecisionVia = 'registry' | 'credential' | 'before' | 'role' | 'policy'

export type Decision
  = | { allowed: true, status: 200, via: 'before' | 'role' | 'policy' }
    | { allowed: false, status: 401 | 403, code: DecisionCode, via: DecisionVia }

/** One `authorization:before` listener's outcome. `throw` (a listener failed) denies. */
export type BeforeVote = 'allow' | 'deny' | 'throw' | undefined

/** One policy's outcome: `throw` (a policy failed) denies. */
export interface PolicyOutcome {
  result: boolean | undefined | 'throw'
  /** Whether the policy also runs for a check without a record. */
  withoutRecord?: boolean
}

export interface DecisionPrincipal {
  kind: PrincipalKind
  /** A bearer credential's permissions, frozen at issue. Missing on a bearer: holds nothing. */
  permissions?: readonly string[]
  /** A token from a foreign issuer (`oauth-resource`): its `permissions` replace the user's roles (step 6). */
  foreign?: boolean
}

export interface DecideInput {
  permission: string
  registry: PermissionRegistry
  principal: DecisionPrincipal | null
  /** Outcomes of the `authorization:before` listeners. */
  before?: readonly BeforeVote[]
  /** The user's held list (`rolePermissions`): role grants and implicit permissions. Ignored for foreign tokens. */
  granted?: readonly string[]
  /** Whether the check is about a record. */
  hasRecord?: boolean
  /** Outcomes of the policies for this permission, module policies before host ones. */
  policies?: readonly PolicyOutcome[]
}

const deny = (status: 401 | 403, code: DecisionCode, via: DecisionVia): Decision => ({ allowed: false, status, code, via })

/**
 * Steps 1-4, which no hook or policy can widen: unknown permission, no principal, session-only permission on a bearer,
 * a bearer whose frozen permissions don't cover it. `null` when they pass.
 */
export function precheck(permission: string, registry: PermissionRegistry, principal: DecisionPrincipal | null): Decision | null {
  const definition = own(registry.permissions, permission)
  if (!definition) return deny(403, 'forbidden', 'registry')
  if (!principal) return deny(401, 'unauthorized', 'credential')
  if (principal.kind === 'session') return null
  if (definition.sessionOnly) return deny(403, 'session_required', 'credential')
  if (!holds(principal.permissions ?? [], permission, registry)) return deny(403, 'insufficient_scope', 'credential')
  return null
}

/** Combines the `authorization:before` listeners: any deny or throw denies, otherwise any allow allows. */
export function combineBefore(votes: readonly BeforeVote[]): 'allow' | 'deny' | undefined {
  if (votes.some(vote => vote === 'deny' || vote === 'throw')) return 'deny'
  return votes.includes('allow') ? 'allow' : undefined
}

/** Combines policies: any `false` or throw denies; `true` and `undefined` keep the result. */
export function combinePolicies(outcomes: readonly PolicyOutcome[], hasRecord: boolean): boolean {
  return outcomes
    .filter(outcome => hasRecord || outcome.withoutRecord)
    .every(outcome => outcome.result !== false && outcome.result !== 'throw')
}

/**
 * The evaluation order, on already-resolved inputs:
 * 1. unknown permission -> 403 forbidden; 2. no principal -> 401; 3. session-only on a bearer -> 403 session_required;
 * 4. bearer without the permission frozen in it -> 403 insufficient_scope; 5. `authorization:before` (deny wins, an
 * allow skips 6-7); 6. the user's roles (or a foreign token's permissions); 7. policies, which only refine a grant;
 * 8. the result.
 */
export function decide(input: DecideInput): Decision {
  const { permission, registry, principal } = input
  const early = precheck(permission, registry, principal)
  if (early) return early

  const before = combineBefore(input.before ?? [])
  if (before === 'deny') return deny(403, 'forbidden', 'before')
  if (before === 'allow') return { allowed: true, status: 200, via: 'before' }

  const held = principal!.foreign ? principal!.permissions ?? [] : input.granted ?? []
  if (!holds(held, permission, registry)) return deny(403, 'forbidden', 'role')

  const hasRecord = input.hasRecord ?? false
  const policies = (input.policies ?? []).filter(outcome => hasRecord || outcome.withoutRecord)
  if (!combinePolicies(policies, hasRecord)) return deny(403, 'forbidden', 'policy')
  return { allowed: true, status: 200, via: policies.some(outcome => outcome.result === true) ? 'policy' : 'role' }
}

/** Collects `allow()` / `deny()` from hook listeners: the object the `authorization:before` context exposes. */
export function createBeforeCollector() {
  const votes: BeforeVote[] = []
  return {
    votes,
    allow: () => {
      votes.push('allow')
    },
    deny: () => {
      votes.push('deny')
    },
    /** Records a listener that threw. */
    fail: () => {
      votes.push('throw')
    },
    outcome: () => combineBefore(votes),
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Delegation (token minting, OAuth consent)
// ---------------------------------------------------------------------------------------------------------------------

export interface ScopeGrantContext {
  registry: PermissionRegistry
  namedScopes?: NamedScopes
  /** Whether the user may delegate one permission: steps 5-6 (before, roles), no policies. */
  canGrant: (permission: string) => boolean
  /** The user's effective roles, inheritance included. */
  roles: readonly string[]
  /** `oauthServer.settings.roleScopes`: the most each role may grant. Unset: no cap beyond permissions. */
  roleScopes?: Readonly<Record<string, readonly string[]>>
  /** Whether the client may receive wildcard scopes (`*`, `resource:*`). */
  wildcardScopes?: boolean
}

/** The union of `roleScopes` over the user's roles, or `undefined` when there is no cap. */
export function roleScopeCap(roles: readonly string[], roleScopes?: Readonly<Record<string, readonly string[]>>): string[] | undefined {
  if (!roleScopes) return undefined
  return [...new Set(roles.flatMap(role => own(roleScopes, role) ?? []))].sort()
}

function withinCap(scope: string, cap: readonly string[], ctx: ScopeGrantContext): boolean {
  if (cap.includes(scope) || cap.includes(ANY_PERMISSION)) return true
  if (own(ctx.namedScopes, scope)) {
    const permissions = expandScopes([scope], ctx.registry, ctx.namedScopes)
    return permissions.length > 0 && permissions.every(name => holds(cap, name, ctx.registry))
  }
  if (isWildcard(scope)) {
    const permissions = expandScopes([scope], ctx.registry)
    return permissions.length > 0 && permissions.every(name => holds(cap, name, ctx.registry))
  }
  const targets = own(ctx.registry.aliases, scope)
  return targets ? targets.every(name => holds(cap, name, ctx.registry)) : holds(cap, scope, ctx.registry)
}

/**
 * Whether a user may give `scope` to a token or client: it is known, a wildcard only for clients that allow them, it
 * lies within the union of the user's `roleScopes`, and the user may delegate every permission it expands to. A named
 * scope without permissions (`openid`) only needs the first three.
 */
export function scopeGrantable(scope: string, ctx: ScopeGrantContext): boolean {
  if (!isKnownScope(scope, ctx.registry, ctx.namedScopes)) return false
  if (isWildcard(scope) && !ctx.wildcardScopes) return false
  const cap = roleScopeCap(ctx.roles, ctx.roleScopes)
  if (cap && !withinCap(scope, cap, ctx)) return false
  const permissions = expandScopes([scope], ctx.registry, ctx.namedScopes)
  if (!permissions.length && !own(ctx.namedScopes, scope)) return false
  return permissions.every(permission => ctx.canGrant(permission))
}

// ---------------------------------------------------------------------------------------------------------------------
// Access and policies
// ---------------------------------------------------------------------------------------------------------------------

/** What `GET /api/auth/me/access` returns and the client's `can()` reads. */
export interface AccessDto {
  kind: PrincipalKind
  /** The credential's scopes; a session has none. */
  scopes: string[]
  /** Registered permissions a check without a record allows. */
  permissions: string[]
  /** Effective roles: for a session, or a token with the `profile` scope. */
  roles?: string[]
}

export type PolicyResult = boolean | undefined

export interface PolicyOptions {
  /** Also run for checks without a record. */
  withoutRecord?: boolean
}

/** What a server policy sees. The server binds `TEvent` to h3's event and the user/principal to auth's types. */
export interface PolicyContext<R = unknown, TEvent = unknown, TUser = unknown, TPrincipal = unknown> {
  event: TEvent
  user: TUser
  principal: TPrincipal
  record: R | undefined
  /** The result so far: always `true` when a policy runs, since policies refine a grant and never make one. */
  granted: boolean
}

/** A server policy: `false` denies, `true` and `undefined` keep the result. Throwing denies. */
export type PolicyFn<R = unknown, TEvent = unknown, TUser = unknown, TPrincipal = unknown>
  = (ctx: PolicyContext<R, TEvent, TUser, TPrincipal>) => PolicyResult | Promise<PolicyResult>

export interface PolicyDefinition<R = unknown, TEvent = unknown, TUser = unknown, TPrincipal = unknown> extends PolicyOptions {
  permission: string
  handler: PolicyFn<R, TEvent, TUser, TPrincipal>
}

/** The server `definePolicy` (wired in by the server runtime). */
export type DefinePolicy<TEvent = unknown, TUser = unknown, TPrincipal = unknown> = <R = unknown>(
  permission: string,
  handler: PolicyFn<R, TEvent, TUser, TPrincipal>,
  options?: PolicyOptions,
) => PolicyDefinition<R, TEvent, TUser, TPrincipal>

/** What a shared policy sees: the same on the server and in the client. */
export interface SharedPolicyContext<R = unknown, TUser = unknown> {
  user: TUser | null
  access: AccessDto | null
  record: R | undefined
  granted: boolean
}

/** A shared (client and server) policy. Synchronous, so the client's `can()` stays synchronous. */
export type SharedPolicyFn<R = unknown, TUser = unknown> = (ctx: SharedPolicyContext<R, TUser>) => PolicyResult

export interface SharedPolicyDefinition<R = unknown, TUser = unknown> extends PolicyOptions {
  permission: string
  handler: SharedPolicyFn<R, TUser>
  shared: true
}

/** Defines a policy that runs on the server and in the client. Throws on an invalid permission name. */
export function defineSharedPolicy<R = unknown, TUser = unknown>(
  permission: string,
  handler: SharedPolicyFn<R, TUser>,
  options: PolicyOptions = {},
): SharedPolicyDefinition<R, TUser> {
  const invalid = validatePermissionName(permission)
  if (invalid) throw new Error(`[auth] defineSharedPolicy: ${invalid}`)
  return { permission, handler, withoutRecord: options.withoutRecord ?? false, shared: true }
}

/**
 * Runs shared policies synchronously into outcomes for `decide`/`combinePolicies`. A policy that throws or returns a
 * promise (it must be synchronous) counts as `throw`, which denies.
 */
export function runSharedPolicies<R, TUser>(
  policies: readonly SharedPolicyDefinition<R, TUser>[],
  ctx: SharedPolicyContext<R, TUser>,
): PolicyOutcome[] {
  return policies.map((policy) => {
    if (ctx.record === undefined && !policy.withoutRecord) return { result: undefined, withoutRecord: false }
    try {
      const result: unknown = policy.handler(ctx)
      if (result === true || result === false || result === undefined) return { result, withoutRecord: policy.withoutRecord }
      return { result: 'throw', withoutRecord: policy.withoutRecord }
    }
    catch {
      return { result: 'throw', withoutRecord: policy.withoutRecord }
    }
  })
}
