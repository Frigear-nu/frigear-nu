import type { Nuxt } from '@nuxt/schema'
import type { AuthResolverDefinition } from '../../types'
import type { Access } from './access'
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

/** A session user filter (`addSessionUserFilter`): `path`'s default export is `(user) => user`, synchronous. */
export interface SessionUserFilterRegistration {
  path: string
}

export interface RoleProviderRegistration {
  /** Absolute path to a module whose default export is an `AuthRoleProvider`. */
  path?: string
}

declare module '@nuxt/schema' {
  interface NuxtHooks {
    'auth:resolvers': (resolvers: AuthResolverDefinition[]) => void | Promise<void>
    'auth:user-store': (registration: AuthUserStoreRegistration) => void | Promise<void>
    'auth:session-filters': (filters: SessionUserFilterRegistration[]) => void | Promise<void>
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

/** What `registerAccess` registers of an `Access`: everything unless narrowed (keys of the `defineAccess` input). */
export interface RegisterAccessOptions<P extends string = string, S extends string = string, R extends string = string> {
  /** Only these permissions (by key). Defaults to all. */
  permissions?: readonly P[]
  /** `false` registers none of the scopes, a list only these. Defaults to all. */
  scopes?: boolean | readonly S[]
  /**
   * `false` registers none of the roles, a list only these. Defaults to all. A `grantTo` naming one of the access's own
   * roles that is not registered is dropped, so an opt-in role needs no second permission list.
   */
  roles?: boolean | readonly R[]
  /**
   * The module behind the permissions, scopes and roles (`from`), shown on the roles admin pages. Defaults to the
   * resource. A definition's own `from` wins.
   */
  from?: string
}

function pick<T>(table: Readonly<Record<string, T>>, only: boolean | readonly string[] | undefined): Array<[string, T]> {
  const entries = Object.entries(table)
  if (only === false) return []
  if (only === undefined || only === true) return entries
  for (const key of only) {
    if (!Object.hasOwn(table, key)) throw new Error(`[auth] registerAccess: "${key}" is not defined.`)
  }
  return entries.filter(([key]) => only.includes(key))
}

/**
 * Registers an `Access` (`defineAccess` from `@frigear-nu/auth/access`): its permissions (`addPermission`), named
 * scopes (`addScope`) and roles (`addRole`, with `from` set). Call it from a module's `setup()`:
 *
 *     registerAccess(nuxt, eventsAccess, { roles: settings.roles ? true : false })
 */
export function registerAccess<P extends string, S extends string, R extends string>(
  nuxt: Nuxt,
  access: Access<string, P, S, R>,
  options: RegisterAccessOptions<NoInfer<P>, NoInfer<S>, NoInfer<R>> = {},
) {
  const { permissions, scopes, roles } = access.definitions as unknown as {
    permissions: Record<string, PermissionDefinition>
    scopes: Record<string, ScopeDefinition>
    roles: Record<string, RoleRegistration>
  }
  const registeredRoles = pick(roles, options.roles)
  const skippedRoles = new Set(Object.keys(roles).filter(name => !registeredRoles.some(([key]) => key === name)))
  const from = options.from ?? access.resource

  const permissionList = pick(permissions, options.permissions).map(([, definition]) => ({
    ...definition,
    from: definition.from ?? from,
    ...(definition.grantTo?.some(role => skippedRoles.has(role)) && { grantTo: definition.grantTo.filter(role => !skippedRoles.has(role)) }),
  }))
  if (permissionList.length) addPermission(nuxt, ...permissionList)
  const scopeList = pick(scopes, options.scopes).map(([, definition]) => ({ ...definition, from: definition.from ?? from }))
  if (scopeList.length) addScope(nuxt, ...scopeList)
  if (registeredRoles.length) addRole(nuxt, ...registeredRoles.map(([, role]) => ({ ...role, from: role.from ?? from })))
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

/**
 * Register a session user filter: `path` (absolute) default-exports a synchronous `(user) => user` that every stored user
 * passes through on its way into the session cookie (`mapUserToSession`), before the host's `session.mapper`. A module
 * drops what must stay out of the sealed cookie (about 4 KB in all) and of `useUserSession()`, such as a large JSON value.
 * Filters only shape what is written to the cookie: the request's user (`getAuth(event).user`, policies, role checks)
 * keeps every field. Filters run in registration order and must not throw.
 *
 * A filter must drop a key unconditionally (always, or never), not depending on its value: routes refresh the cookie
 * with `setUserSession`, which merges, so a key dropped only sometimes would keep its old value in the cookie.
 */
export function addSessionUserFilter(nuxt: Nuxt, path: string) {
  nuxt.hook('auth:session-filters', (filters) => {
    if (!filters.some(filter => filter.path === path)) filters.push({ path })
  })
}

/**
 * The source of `#auth/session-mapper`. Its default export (the session cookie's user) passes each user through the
 * filters at `filterPaths` in order, then through the host's mapper at `mapperPath` (or as it is, without one);
 * `mapPrincipalUser` (the request's user) only through the host's mapper.
 */
export function sessionMapperContents(filterPaths: readonly string[], mapperPath?: string): string {
  return [
    ...filterPaths.map((path, index) => `import filter${index} from ${JSON.stringify(path)}`),
    mapperPath ? `import mapper from ${JSON.stringify(mapperPath)}` : 'const mapper = user => user',
    `const filters = [${filterPaths.map((_, index) => `filter${index}`).join(', ')}]`,
    'export default user => mapper(filters.reduce((current, filter) => filter(current), user))',
    'export const mapPrincipalUser = user => mapper(user)',
  ].join('\n')
}

/**
 * `patterns` (route rule patterns such as `/help` or `/help/**`) once more under each `@nuxtjs/i18n` locale prefix
 * (`/da/help`, ...), since with i18n every page also exists under `/<locale>/...`. Without i18n, `patterns` as given.
 * Read from `nuxt.options.i18n.locales` at call time.
 */
export function localizedRoutePatterns(nuxt: Nuxt, patterns: readonly string[]): string[] {
  const locales = (nuxt.options as { i18n?: { locales?: Array<string | { code: string }> } }).i18n?.locales ?? []
  const prefixes = ['', ...locales.map(locale => `/${typeof locale === 'string' ? locale : locale.code}`)]
  return [...new Set(prefixes.flatMap(prefix => patterns.map(pattern => `${prefix}${pattern}`)))]
}

export interface GuardPagesOptions {
  /** Also render these pages in this app layout (`appLayout`). */
  layout?: string
}

/**
 * Marks pages as signed-in only: an `authenticated: true` route rule (and `appLayout` with `layout`) for every pattern
 * under every i18n locale prefix ({@link localizedRoutePatterns}). A rule the app or another module already set for a
 * pattern keeps its keys. Returns the patterns it set.
 *
 * `@frigear-nu/authorization` enforces the rule on pages (auth's server middleware only covers `/api/**`); without it
 * auth warns at build time that nothing checks the rule. Paths match case-insensitively (`/ME` is `/me`).
 *
 * Only locale prefixes are derived: a translated path (`@nuxtjs/i18n` `customRoutes` / `defineI18nRoute`, such as
 * `/da/hjaelp` for `/help`) is not, so list it in `patterns` too, or guard the page with `definePageMeta({ authorize })`.
 */
export function guardPages(nuxt: Nuxt, patterns: readonly string[], options: GuardPagesOptions = {}): string[] {
  const rules = nuxt.options.routeRules ||= {}
  const localized = localizedRoutePatterns(nuxt, patterns)
  for (const pattern of localized) {
    rules[pattern] = { authenticated: true, ...(options.layout ? { appLayout: options.layout } : {}), ...rules[pattern] } as (typeof rules)[string]
  }
  return localized
}

export type { RoleRegistration } from './access-compile'
