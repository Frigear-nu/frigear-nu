import type { Nuxt } from '@nuxt/schema'
import type { AuthResolverDefinition, AuthRoleDefinition, AuthScopeDefinition } from '../../types'
import type { CompiledAccess, RoleRegistration } from './access-compile'
import type { PermissionDefinition, ScopeDefinition } from './permissions'

// Build-time registration API for other modules' `setup()`. Registrations are collected through hooks and compiled by
// auth at `modules:done`, so the order in which modules are installed does not matter. Configuration errors (an
// unregistered grant, an unknown requirement, an inheritance cycle, ...) fail the build.

export interface AuthUserStoreRegistration {
  /** Absolute path to a module whose default export is an `AuthUserStore`. */
  path?: string
}

/** A role requirement (`addRoleRequirement`): `path`'s default export is `(ctx: { event, user, value }) => boolean | Promise<boolean>`. */
export interface RoleRequirementRegistration {
  name: string
  path: string
}

/** A policy file (`addPolicies`): its `definePolicy()` / `defineSharedPolicy()` exports. */
export interface PolicyFileRegistration {
  path: string
  /** The host's own policies, which run after every module's. */
  host?: boolean
  /**
   * The file only uses `defineSharedPolicy` from `@frigear-nu/auth/policies`, so it is also bundled into the app
   * (`#auth/shared-policies`). The build fails when it imports `#imports`, `@nuxthub/db`, `h3` or `#auth/*`.
   */
  shared?: boolean
}

export interface RoleProviderRegistration {
  /** Absolute path to a module whose default export is an `AuthRoleProvider`. */
  path?: string
}

declare module '@nuxt/schema' {
  interface NuxtHooks {
    'auth:resolvers': (resolvers: AuthResolverDefinition[]) => void | Promise<void>
    /** @deprecated — removed in phase 2: the old `addAuthScope` registrations. */
    'auth:scopes': (scopes: AuthScopeDefinition[]) => void | Promise<void>
    /** @deprecated — removed in phase 2: the old `addAuthRole` registrations. */
    'auth:roles': (roles: AuthRoleDefinition[]) => void | Promise<void>
    'auth:user-store': (registration: AuthUserStoreRegistration) => void | Promise<void>
    'auth:permissions': (permissions: PermissionDefinition[]) => void | Promise<void>
    'auth:named-scopes': (scopes: ScopeDefinition[]) => void | Promise<void>
    'auth:role-definitions': (roles: RoleRegistration[]) => void | Promise<void>
    'auth:role-requirements': (requirements: RoleRequirementRegistration[]) => void | Promise<void>
    'auth:policies': (files: PolicyFileRegistration[]) => void | Promise<void>
    'auth:role-provider': (registration: RoleProviderRegistration) => void | Promise<void>
    'auth:default-roles': (roles: string[]) => void | Promise<void>
    /** After access control compiled without errors (at `modules:done`): validate what depends on it (`roleScopes`). */
    'auth:access-compiled': (access: CompiledAccess) => void | Promise<void>
  }
}

/** Register a bearer-token resolver (e.g. OAuth access tokens). The resolver path must be absolute. */
export function addAuthResolver(nuxt: Nuxt, resolver: AuthResolverDefinition) {
  if (!resolver.prefix && !resolver.jwt) {
    throw new Error(`[auth] Resolver "${resolver.name}" must claim tokens with a "prefix" or "jwt: true".`)
  }
  nuxt.hook('auth:resolvers', (resolvers) => {
    resolvers.push(resolver)
  })
}

/**
 * Register permissions (`resource:action`). The same name may be registered twice as long as `sensitive`,
 * `sessionOnly` and `implicit` agree. `implicit` permissions are held by every signed-in user, also without
 * `@frigear-nu/authorization` (self-service such as `tickets:read`).
 */
export function addPermission(nuxt: Nuxt, ...permissions: PermissionDefinition[]) {
  nuxt.hook('auth:permissions', (list) => {
    list.push(...permissions)
  })
}

/**
 * Register named scopes: a group of permissions under one name an API token or OAuth client can be given (`tickets`
 * -> `tickets:read`, `tickets:write`), or none (`openid`). Never sensitive or `sessionOnly` permissions. Served in
 * `#auth/permissions` (`namedScopes`); `oauthServer` config and database scopes add on top.
 */
export function addScope(nuxt: Nuxt, ...scopes: ScopeDefinition[]) {
  nuxt.hook('auth:named-scopes', (list) => {
    list.push(...scopes)
  })
}

/**
 * Register roles. Definitions of one name are merged: module ones union their grants and parents (the first label
 * wins, differing requirements or `auto` fail the build); a host one (`source: 'host'`, or `override: true`) merges
 * into them with its label, description, requirements, `auto` and `assignable` winning, unless `replace: true` drops
 * the module definitions and the `grantTo` grants into it. Pass `from` (the module name) for provenance.
 */
export function addRole(nuxt: Nuxt, ...roles: RoleRegistration[]) {
  nuxt.hook('auth:role-definitions', (list) => {
    list.push(...roles)
  })
}

/**
 * Register a role requirement (`requirements: { <name>: value }` on a role). `path`'s default export decides it per
 * user: `(ctx: { event, user, value }) => boolean | Promise<boolean>`. A requirement that throws is not met.
 */
export function addRoleRequirement(nuxt: Nuxt, requirement: RoleRequirementRegistration) {
  nuxt.hook('auth:role-requirements', (list) => {
    list.push(requirement)
  })
}

/** Register a file of server policies (`definePolicy`) or shared policies (`defineSharedPolicy`). */
export function addPolicies(nuxt: Nuxt, file: PolicyFileRegistration) {
  nuxt.hook('auth:policies', (list) => {
    list.push(file)
  })
}

/** Provide where the users' assigned roles are stored (`@frigear-nu/authorization`). First registration wins. */
export function setRoleProvider(nuxt: Nuxt, provider: { path: string }) {
  nuxt.hook('auth:role-provider', (registration) => {
    registration.path ||= provider.path
  })
}

/** Roles every signed-in user holds (`authorization.defaultRoles`). Never `auto` roles. */
export function setDefaultRoles(nuxt: Nuxt, roles: string[]) {
  nuxt.hook('auth:default-roles', (list) => {
    list.push(...roles)
  })
}

/** Provide where users are read and written by the sign-in flows and bearer credentials. First registration wins. */
export function setAuthUserStore(nuxt: Nuxt, path: string) {
  nuxt.hook('auth:user-store', (registration) => {
    registration.path ||= path
  })
}

export { addAuthRole, addAuthScope } from './legacy-build'
export type { RoleRegistration } from './access-compile'
