import type { PermissionDefinition, RoleContribution, RoleDefinition, ScopeDefinition } from './permissions'

// Typed access declarations: `defineAccess` (a module's permissions, scopes and roles) and `defineRoles` (the host's
// roles). Framework-free (no Nuxt, Vue or h3), so a module's `access.ts` can be imported by its `module.ts`, its server
// routes, its tests and the client alike (`@frigear-nu/auth/access`).

declare global {
  /**
   * Every registered permission, as keys. Filled in by the type template auth generates once access control is compiled
   * (`.nuxt/types/auth-access.d.ts`); empty where nothing is generated (a module package's own build), so `Permission`
   * is `string` there.
   */
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface FrigearPermissions {}
  /** Every compiled role (module roles and `authorization.roles`), as keys. Generated like `FrigearPermissions`. */
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface FrigearRoles {}
}

type KeysOr<T, Fallback> = [keyof T] extends [never] ? Fallback : Extract<keyof T, string>

/** A registered permission (`events:manage`). `string` until the app's types are generated (`nuxi prepare`). */
export type Permission = KeysOr<FrigearPermissions, string>

/** A compiled role name (`admin`). `string` until the app's types are generated. */
export type RoleName = KeysOr<FrigearRoles, string>

type ResourceOf<P> = P extends `${infer R}:${string}` ? R : never

/** What a role or a scope may grant: a permission, `*` or `resource:*` (wildcards never cover sensitive permissions). */
export type PermissionGrant = Permission | '*' | `${ResourceOf<Permission>}:*`

// ---------------------------------------------------------------------------------------------------------------------
// defineAccess
// ---------------------------------------------------------------------------------------------------------------------

/** A permission of `defineAccess`: its name comes from the key, its i18n keys are derived unless given. */
export type AccessPermission = Omit<PermissionDefinition, 'name'>

/** A named scope of `defineAccess`: its name is the key. */
export type AccessScope = Omit<ScopeDefinition, 'name'>

/** A role of `defineAccess` (a module's default role): its name is the key. */
export type AccessRole = RoleDefinition

export interface AccessInput<P extends string, S extends string, R extends string> {
  /** The i18n namespace of the derived keys (`<i18n>.permissions.<key>`). Defaults to the resource. */
  i18n?: string
  /**
   * Keyed by action (`manage` -> `<resource>:manage`); a key with a colon is a full name, for a resource the module
   * owns besides its own (`'tickets:read'`).
   */
  permissions: Record<P, AccessPermission>
  /** Named scopes (`tickets` -> `tickets:read`, `tickets:write`), keyed by name. */
  scopes?: Record<S, AccessScope>
  /** The module's default roles, keyed by name. The host's `authorization.roles` merge into them. */
  roles?: Record<R, AccessRole>
}

/** `manage` -> `events:manage`; a key that already has a colon is kept. */
export type AccessPermissionName<Resource extends string, K extends string> = K extends `${string}:${string}` ? K : `${Resource}:${K}`

/** What `defineAccess` returns: the typed names, and the definitions `registerAccess` registers. */
export interface Access<Resource extends string = string, P extends string = string, S extends string = string, R extends string = string> {
  resource: Resource
  /** Permission names by key: `eventsAccess.permissions.manage` is `'events:manage'`. */
  permissions: { readonly [K in P]: AccessPermissionName<Resource, K> }
  /** Scope names by key. */
  scopes: { readonly [K in S]: K }
  /** Role names by key. */
  roles: { readonly [K in R]: K }
  /** The resolved definitions, by key (`addPermission`, `addScope`, `addRole`). */
  definitions: {
    permissions: { readonly [K in P]: PermissionDefinition }
    scopes: { readonly [K in S]: ScopeDefinition }
    roles: { readonly [K in R]: RoleContribution }
  }
}

/** `tickets:read` -> `ticketsRead`, `member-area` -> `memberArea`. */
function i18nSegment(key: string): string {
  return key.replace(/[:._-]+([a-z0-9])/gi, (_, char: string) => char.toUpperCase())
}

/**
 * Declares what a module (or a host feature) adds to access control, keyed so the names are typed:
 *
 *     export const eventsAccess = defineAccess('events', {
 *       permissions: {
 *         manage: { label: 'Manage events', grantTo: ['admin'] },  // events:manage
 *         'tickets:read': { label: 'Read your tickets', implicit: true },
 *       },
 *       scopes: { tickets: { label: 'Your tickets', permissions: ['tickets:read'] } },
 *     })
 *     eventsAccess.permissions.manage // 'events:manage'
 *
 * Derived i18n keys (unless given): `<i18n>.permissions.<key>` and `...Description` (a full-name key is camel-cased:
 * `tickets:read` -> `ticketsRead`; one of the resource itself drops the resource), `<i18n>.scopes.<key>`,
 * `<i18n>.roles.<key>`. Register it from `setup()` with `registerAccess` (`@frigear-nu/auth/utils`).
 */
export function defineAccess<const Resource extends string, P extends string, S extends string = never, R extends string = never>(
  resource: Resource,
  input: AccessInput<P, S, R>,
): Access<Resource, P, S, R> {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(resource)) throw new Error(`[auth] defineAccess: "${resource}" is not a valid resource name.`)
  const namespace = input.i18n ?? resource
  const keyOf = (kind: string, key: string) => `${namespace}.${kind}.${i18nSegment(key)}`

  const permissions: Record<string, string> = {}
  const permissionDefinitions: Record<string, PermissionDefinition> = {}
  for (const [key, definition] of Object.entries<AccessPermission>(input.permissions)) {
    const name = key.includes(':') ? key : `${resource}:${key}`
    const labelKey = definition.labelKey ?? keyOf('permissions', name.startsWith(`${resource}:`) ? name.slice(resource.length + 1) : name)
    permissions[key] = name
    permissionDefinitions[key] = { ...definition, name, labelKey, descriptionKey: definition.descriptionKey ?? `${labelKey}Description` }
  }

  const scopes: Record<string, string> = {}
  const scopeDefinitions: Record<string, ScopeDefinition> = {}
  for (const [name, definition] of Object.entries<AccessScope>(input.scopes ?? {})) {
    const labelKey = definition.labelKey ?? keyOf('scopes', name)
    scopes[name] = name
    scopeDefinitions[name] = { ...definition, name, labelKey, descriptionKey: definition.descriptionKey ?? `${labelKey}Description` }
  }

  const roles: Record<string, string> = {}
  const roleDefinitions: Record<string, RoleContribution> = {}
  for (const [name, definition] of Object.entries<AccessRole>(input.roles ?? {})) {
    const labelKey = definition.labelKey ?? keyOf('roles', name)
    roles[name] = name
    roleDefinitions[name] = { ...definition, name, labelKey, descriptionKey: definition.descriptionKey ?? `${labelKey}Description` }
  }

  return {
    resource,
    permissions,
    scopes,
    roles,
    definitions: { permissions: permissionDefinitions, scopes: scopeDefinitions, roles: roleDefinitions },
  } as unknown as Access<Resource, P, S, R>
}

// ---------------------------------------------------------------------------------------------------------------------
// defineRoles
// ---------------------------------------------------------------------------------------------------------------------

/** A host role (`authorization.roles`), with its grants and parents typed once the app's types are generated. */
export interface HostRole<K extends string = string> extends Omit<RoleDefinition, 'grant' | 'inherit'> {
  /** Permissions, `*` or `resource:*`. `*` never covers sensitive permissions: grant those by name. */
  grant?: PermissionGrant[]
  /** Roles whose permissions this role also holds: one of these roles or a module's (`eventmanager`). */
  inherit?: Array<K | RoleName>
  /** Replace a module's role of the same name (and the `grantTo` grants into it) instead of merging into it. */
  replace?: boolean
}

/**
 * Types the host's roles, for `authorization: { roles: defineRoles({ ... }) }` (or a `roles.ts` it imports): grants
 * are checked against the registered permissions and `inherit` against these and the modules' roles, once the app's
 * types are generated (`nuxi prepare`). Returns the roles unchanged.
 */
export function defineRoles<const K extends string>(roles: { [P in K]: HostRole<NoInfer<K>> }): { [P in K]: HostRole<K> } {
  return roles
}
