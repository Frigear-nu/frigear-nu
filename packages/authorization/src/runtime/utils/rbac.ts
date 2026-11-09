/**
 * Role-based access control (NIST RBAC, hierarchical): roles hold permissions, senior roles inherit their juniors'
 * permissions, and a user's credentials act within the permissions of their role. Permissions are the scope names
 * modules register with `addAuthScope` (`events:manage`, `tickets:*`, ...).
 *
 * Everything here is pure and runs at build time: the module compiles the built-in roles, the roles modules ship
 * (`addAuthRole`), the permissions modules aggregate to roles (`aggregateTo`) and the host's `authorization.roles`
 * into one table.
 */

export interface RbacScope {
  name: string
  description?: string
  aggregateTo?: string[]
  /** @deprecated read as `aggregateTo` when that is not set. */
  roles?: string[]
}

export interface RbacRoleInput {
  name: string
  label?: string
  description?: string
  inherits?: string[]
  inheritedBy?: string[]
  permissions?: string[]
}

export interface RbacConfig {
  /**
   * Role names from most to least senior: the rank (who may assign which role) and, unless `inherits` says otherwise
   * for a role, the inheritance chain (each listed role inherits the next one).
   */
  hierarchy?: string[]
  /**
   * The roles whose permissions a role inherits, replacing what `hierarchy` (or its definition) gives it. Keeps the
   * rank but stops permissions flowing up: `{ supplier: ['user'] }` ranks supplier above partner without giving it
   * partner's permissions; `[]` inherits nothing.
   */
  inherits?: Record<string, string[]>
  /** Extra permissions per role (scope names or `resource:*` wildcards). */
  grant?: Record<string, string[]>
  /** Permissions taken away from a role (and so from the roles above it, unless granted again). */
  revoke?: Record<string, string[]>
  labels?: Record<string, string>
  descriptions?: Record<string, string>
  /** Roles the host adds (beyond those in `hierarchy`). */
  definitions?: RbacRoleInput[]
  /** The role of a user whose stored role is unknown. Defaults to `user`. */
  defaultRole?: string
}

export type RbacRoleSource = 'built-in' | 'module' | 'app'

/** Why a role holds a permission. */
export type RbacGrant
  = | { via: 'all' }
    | { via: 'direct' }
    | { via: 'aggregated', module?: string }
    | { via: 'granted' }
    | { via: 'inherited', from: string }

export interface RbacRole {
  name: string
  label: string
  description?: string
  source: RbacRoleSource
  /** Direct juniors (role hierarchy). */
  inherits: string[]
  /** Every role whose permissions this one inherits, transitively. */
  juniors: string[]
  /** Every role ranked below this one (`hierarchy`, and inherited roles): the roles it may assign. */
  outranks: string[]
  /** Effective permissions, sorted; `*` for admin. */
  permissions: string[]
  /** Per permission: why the role holds it. */
  grants: Record<string, RbacGrant>
}

export interface RbacTable {
  defaultRole: string
  /** Most senior first. */
  roles: RbacRole[]
}

export interface RbacCompileResult {
  table: RbacTable
  errors: string[]
  warnings: string[]
}

export const ADMIN_ROLE = 'admin'
export const USER_ROLE = 'user'

const isPii = (scope: string) => scope.endsWith(':pii')

/** Whether `permission` names a registered scope, a `resource:*` wildcard of one, or `*`. */
function isKnownPermission(permission: string, registered: readonly string[]): boolean {
  if (permission === '*' || registered.includes(permission)) return true
  if (!permission.endsWith(':*')) return false
  const resource = permission.slice(0, -2)
  return resource.length > 0 && registered.some(name => name.startsWith(`${resource}:`))
}

/** Compiles the role → permission table. Errors are configuration mistakes the build must stop on. */
export function compileRbac(input: { scopes: RbacScope[], moduleRoles?: RbacRoleInput[], config?: RbacConfig }): RbacCompileResult {
  const errors: string[] = []
  const warnings: string[] = []
  const config = input.config ?? {}
  const scopes = [...new Map(input.scopes.map(scope => [scope.name, scope])).values()]
  const registered = scopes.map(scope => scope.name)

  interface Draft { name: string, label?: string, description?: string, source: RbacRoleSource, inherits: Set<string>, direct: Map<string, RbacGrant> }
  const roles = new Map<string, Draft>()
  const ensure = (name: string, source: RbacRoleSource) => {
    let role = roles.get(name)
    if (!role) {
      role = { name, source, inherits: new Set(), direct: new Map() }
      roles.set(name, role)
    }
    return role
  }

  // 1. Built-in roles: admin above user.
  ensure(ADMIN_ROLE, 'built-in').label = 'Administrator'
  ensure(ADMIN_ROLE, 'built-in').inherits.add(USER_ROLE)
  ensure(USER_ROLE, 'built-in').label = 'User'

  // 2. Roles modules and the host define.
  const definitions = [
    ...(input.moduleRoles ?? []).map(role => ({ role, source: 'module' as const })),
    ...(config.definitions ?? []).map(role => ({ role, source: 'app' as const })),
  ]
  for (const { role: definition, source } of definitions) {
    const role = ensure(definition.name, roles.has(definition.name) ? roles.get(definition.name)!.source : source)
    role.label = definition.label ?? role.label
    role.description = definition.description ?? role.description
    for (const junior of definition.inherits ?? [USER_ROLE]) if (junior !== role.name) role.inherits.add(junior)
    for (const senior of definition.inheritedBy ?? [ADMIN_ROLE]) {
      if (senior !== role.name) ensure(senior, 'app').inherits.add(role.name)
    }
    for (const permission of definition.permissions ?? []) role.direct.set(permission, { via: 'direct' })
  }

  // 3. The host's hierarchy: a chain, each listed role directly above the next.
  const hierarchy = config.hierarchy ?? []
  if (hierarchy.length) {
    if (new Set(hierarchy).size !== hierarchy.length) errors.push('authorization.roles.hierarchy lists a role twice.')
    for (const name of hierarchy) ensure(name, 'app')
    hierarchy.forEach((name, index) => {
      const role = roles.get(name)!
      const next = hierarchy[index + 1]
      // A listed role's juniors are the next listed role, plus any unlisted roles it already had (a module's role).
      for (const junior of [...role.inherits]) if (hierarchy.includes(junior)) role.inherits.delete(junior)
      if (next) role.inherits.add(next)
    })
  }

  // 3b. Explicit inheritance replaces the chain for the roles it names; the rank stays.
  for (const [name, juniorsOf] of Object.entries(config.inherits ?? {})) {
    if (!roles.has(name)) {
      errors.push(`authorization.roles.inherits names unknown role "${name}".`)
      continue
    }
    roles.get(name)!.inherits = new Set(juniorsOf.filter(junior => junior !== name))
  }

  // 4. Permissions modules aggregate to roles.
  for (const scope of scopes) {
    const targets = scope.aggregateTo ?? scope.roles ?? []
    for (const target of targets) {
      const role = roles.get(target)
      if (!role) {
        warnings.push(`Permission "${scope.name}" aggregates to role "${target}", which this app does not have: only ${ADMIN_ROLE} holds it.`)
        continue
      }
      if (!role.direct.has(scope.name)) role.direct.set(scope.name, { via: 'aggregated' })
    }
  }

  // 5. The host's grants.
  const checkRole = (name: string, where: string) => {
    if (!roles.has(name)) errors.push(`authorization.roles.${where} names unknown role "${name}".`)
    return roles.has(name)
  }
  const checkPermission = (permission: string, where: string) => {
    if (!isKnownPermission(permission, registered)) errors.push(`authorization.roles.${where} names unknown permission "${permission}".`)
  }
  for (const [name, permissions] of Object.entries(config.grant ?? {})) {
    if (!checkRole(name, 'grant')) continue
    for (const permission of permissions) {
      checkPermission(permission, `grant.${name}`)
      roles.get(name)!.direct.set(permission, { via: 'granted' })
    }
  }
  for (const [name, permissions] of Object.entries(config.revoke ?? {})) {
    checkRole(name, 'revoke')
    for (const permission of permissions) checkPermission(permission, `revoke.${name}`)
  }
  for (const definition of definitions) {
    for (const permission of definition.role.permissions ?? []) checkPermission(permission, `role "${definition.role.name}" permissions`)
  }
  for (const name of Object.keys(config.labels ?? {})) {
    if (checkRole(name, 'labels')) roles.get(name)!.label = config.labels![name]
  }
  for (const name of Object.keys(config.descriptions ?? {})) {
    if (checkRole(name, 'descriptions')) roles.get(name)!.description = config.descriptions![name]
  }
  for (const role of roles.values()) {
    for (const junior of role.inherits) {
      if (!roles.has(junior)) errors.push(`Role "${role.name}" inherits unknown role "${junior}".`)
    }
  }
  const defaultRole = config.defaultRole ?? USER_ROLE
  if (!roles.has(defaultRole)) errors.push(`authorization.roles.defaultRole names unknown role "${defaultRole}".`)

  // 6. Admin holds everything, the personal-data permissions included (a wildcard never covers them).
  const admin = roles.get(ADMIN_ROLE)!
  admin.direct.set('*', { via: 'all' })
  for (const scope of registered.filter(isPii)) if (!admin.direct.has(scope)) admin.direct.set(scope, { via: 'all' })

  // 7. Effective permissions through the hierarchy (cycles are errors).
  const effective = new Map<string, Map<string, RbacGrant>>()
  const juniors = new Map<string, Set<string>>()
  const visiting = new Set<string>()
  const resolve = (name: string): Map<string, RbacGrant> => {
    const done = effective.get(name)
    if (done) return done
    const role = roles.get(name)
    if (!role) return new Map()
    if (visiting.has(name)) {
      errors.push(`The role hierarchy has a cycle through "${name}".`)
      return new Map()
    }
    visiting.add(name)
    const grants = new Map<string, RbacGrant>()
    const below = new Set<string>()
    for (const junior of role.inherits) {
      const inherited = resolve(junior)
      below.add(junior)
      for (const deeper of juniors.get(junior) ?? []) below.add(deeper)
      for (const [permission, grant] of inherited) {
        if (!grants.has(permission)) grants.set(permission, grant.via === 'inherited' ? grant : { via: 'inherited', from: junior })
      }
    }
    for (const [permission, grant] of role.direct) grants.set(permission, grant)
    for (const permission of config.revoke?.[name] ?? []) grants.delete(permission)
    visiting.delete(name)
    effective.set(name, grants)
    juniors.set(name, below)
    return grants
  }
  for (const name of roles.keys()) resolve(name)

  // 8. Order: the hierarchy as given, then the rest by seniority (more juniors first), user last.
  const order = [...roles.keys()].sort((a, b) => {
    const ia = hierarchy.indexOf(a)
    const ib = hierarchy.indexOf(b)
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1 || ib !== -1) {
      // A listed role vs an unlisted one: whoever inherits the other is more senior.
      if (juniors.get(a)?.has(b)) return -1
      if (juniors.get(b)?.has(a)) return 1
      return ia !== -1 ? -1 : 1
    }
    return (juniors.get(b)?.size ?? 0) - (juniors.get(a)?.size ?? 0) || a.localeCompare(b)
  })

  for (const scope of scopes) {
    if (scope.name.endsWith(':pii')) continue
    const holders = order.filter(name => name !== ADMIN_ROLE && effective.get(name)?.has(scope.name))
    if (!holders.length && !(scope.aggregateTo ?? scope.roles)?.length) {
      warnings.push(`Permission "${scope.name}" is held by ${ADMIN_ROLE} only (no aggregateTo and no grant).`)
    }
  }

  // Rank: below a role are the roles after it in `hierarchy` and every role it inherits (and theirs).
  const outranks = (name: string): string[] => {
    const below = new Set(juniors.get(name) ?? [])
    const index = hierarchy.indexOf(name)
    if (index !== -1) {
      for (const lower of hierarchy.slice(index + 1)) {
        below.add(lower)
        for (const deeper of juniors.get(lower) ?? []) below.add(deeper)
      }
    }
    below.delete(name)
    return order.filter(role => below.has(role))
  }

  return {
    errors: [...new Set(errors)],
    warnings,
    table: {
      defaultRole,
      roles: order.map((name) => {
        const role = roles.get(name)!
        const grants = Object.fromEntries([...effective.get(name)!].sort(([a], [b]) => a.localeCompare(b)))
        return {
          name,
          label: role.label ?? name,
          description: role.description,
          source: role.source,
          inherits: [...role.inherits],
          juniors: [...(juniors.get(name) ?? [])],
          outranks: outranks(name),
          permissions: Object.keys(grants),
          grants,
        }
      }),
    },
  }
}

/** The compiled role a user acts as: their stored role when it exists, else the default role. */
export function roleOf<R extends { name: string }>(table: { defaultRole: string, roles: R[] }, role: string | null | undefined): R {
  return table.roles.find(candidate => candidate.name === role)
    ?? table.roles.find(candidate => candidate.name === table.defaultRole)!
}

/**
 * Whether `actor` may give someone the role `target` (or change someone who has it): only roles below their own, and
 * admins may manage admins.
 */
export function canAssignRole(table: RbacTable, actor: string | null | undefined, target: string | null | undefined): boolean {
  if (!actor || !target) return false
  const role = table.roles.find(candidate => candidate.name === actor)
  if (!role || !table.roles.some(candidate => candidate.name === target)) return false
  return role.outranks.includes(target) || (actor === ADMIN_ROLE && target === ADMIN_ROLE)
}
