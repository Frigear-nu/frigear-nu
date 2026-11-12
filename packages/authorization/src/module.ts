import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  addComponentsDir,
  addImports,
  addPlugin,
  addRouteMiddleware,
  addServerImportsDir,
  addServerPlugin,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
  useLogger,
} from '@nuxt/kit'
import type { ModuleDependencyMeta, Nuxt } from '@nuxt/schema'
import {
  addModulePages,
  addModuleRoutes,
  addOptionalMenuSource,
  extendDatabaseTable,
  inlineModuleRuntime,
  registerDatabaseTable,
  registerLocales,
  registerModule,
  registerTailwindSource,
} from '@frigear-nu/module-kit/utils'
import { addPolicies, addRole, registerAccess, setDefaultRoles, setRoleProvider } from '@frigear-nu/auth/utils'
import { authorizationAccess } from './runtime/access'
import type { PermissionRegistry } from '@frigear-nu/auth/utils'
import { resolveAuthMode } from '@frigear-nu/auth/mode'
import { AUTHORIZATION_ROLES_READ, ROUTE_RULE_KEYS } from './runtime/utils/types'
import { findUnenforcedPatterns, normalizeAuthorizeMeta } from './runtime/utils/rules'
import type { AuthorizeMeta } from './runtime/utils/types'
import type { AuthorizationRouteRules, ModuleOptions, PublicModuleOptions } from './types'

export type {
  AuthorizationAssignedRoleDto,
  AuthorizationPermissionGrant,
  AuthorizationPermissionSource,
  AuthorizationRoleOptions,
  AuthorizationResponse,
  AuthorizationRoleDto,
  AuthorizationRolePermissionDto,
  AuthorizationRoleSummaryDto,
  AuthorizationRoleUserDto,
  AuthorizationRoleUsersPageDto,
  AuthorizationRouteRules,
  AuthorizationUserRolesDto,
  AuthorizationUserRolesInput,
  AuthorizeMeta,
  ModuleOptions,
  PublicModuleOptions,
  RouteRule,
} from './types'

declare module 'nuxt/schema' {
  interface NuxtConfig {
    authorization?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    authorization?: PublicModuleOptions
  }
}

/** The host's policy file for `kind`: the configured path, or the conventional one when it exists. */
function policyFile(nuxt: Nuxt, configured: string | false | undefined, conventional: string): string | undefined {
  if (configured === false) return undefined
  if (configured) return join(nuxt.options.rootDir, configured)
  return ['ts', 'js', 'mjs'].map(extension => join(nuxt.options.rootDir, `${conventional}.${extension}`)).find(existsSync)
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/authorization', configKey: 'authorization' },
  defaults: {
    roles: {},
  },
  // The mode is the app's own `authentication.mode` (`resolveAuthMode`). Client mode has no server: the rules only
  // decide what the app shows, the API decides what is allowed.
  moduleDependencies: (nuxt: Nuxt): Record<string, ModuleDependencyMeta> => resolveAuthMode(nuxt) === 'client'
    ? {
        '@frigear-nu/module-kit': { version: '>=0.0.1' },
        '@frigear-nu/auth': { version: '>=0.0.1' },
      }
    : {
        '@nuxthub/core': { version: '>=0.10' },
        '@frigear-nu/module-kit': { version: '>=0.0.1' },
        '@frigear-nu/auth': { version: '>=0.0.1' },
        '@frigear-nu/users': { version: '>=0.0.1' },
        // The roles admin: pages in the admin shell, its sidebar entry and a tab on the user page.
        '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
        '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
        '@frigear-nu/widget': { version: '>=0.0.0', optional: true },
      },
  async setup(options, nuxt) {
    registerModule('@frigear-nu/authorization', nuxt)
    const resolver = createResolver(import.meta.url)
    const server = resolveAuthMode(nuxt) === 'server'
    const logger = useLogger('@frigear-nu/authorization')

    nuxt.options.runtimeConfig.public.authorization = {
      routes: {},
      exempt: [],
      redirectTo: options.redirectTo || undefined,
      client: !server || undefined,
    }
    // `definePageMeta({ authorize })` in `pages:resolved` too (`@frigear-nu/mobile` checks that something is guarded).
    nuxt.options.experimental.extraPageMetaExtractionKeys = [...new Set([...(nuxt.options.experimental.extraPageMetaExtractionKeys ?? []), 'authorize'])]

    // Rules are keys on the native `routeRules` (`'/admin/**': { permission: 'admin:access' }`). Auth's server
    // middleware enforces them for `/api/**`; the app's route rules matcher only keeps known keys, so the page
    // middleware gets them collected here (once every module has had its say) through public runtime config.
    nuxt.hook('modules:done', () => {
      const routes: Record<string, AuthorizationRouteRules> = {}
      const sources = [nuxt.options.routeRules, nuxt.options.nitro?.routeRules]
      for (const [pattern, rule] of sources.flatMap(source => Object.entries(source ?? {}))) {
        const picked = Object.fromEntries(ROUTE_RULE_KEYS
          .filter(key => (rule as Record<string, unknown>)[key] !== undefined)
          .map(key => [key, (rule as Record<string, unknown>)[key]]))
        if (Object.keys(picked).length) routes[pattern] = { ...routes[pattern], ...picked }
      }
      // The anonymous entry points of Auth (sign-in pages, the callback) stay reachable under any less specific guard
      // (`'/**': { authenticated: true }`). App rules for the same or a more specific pattern still apply (`resolveRule`).
      // With @nuxtjs/i18n every page also exists under `/<locale>/...`.
      const prefixes = ['', ...((nuxt.options as { i18n?: { locales?: (string | { code: string })[] } }).i18n?.locales ?? [])
        .map(locale => typeof locale === 'string' ? locale : locale.code)
        .map(code => `/${code}`)]
      const authentication = (nuxt.options.runtimeConfig.public as { authentication?: { publicPaths?: string[], client?: { redirect?: { login?: string } } } }).authentication
      const publicPaths = authentication?.publicPaths ?? []
      const exempt = [...new Set(publicPaths.flatMap(pattern => pattern.startsWith('/api/')
        ? [pattern]
        : prefixes.map(prefix => pattern === '/' ? (prefix || '/') : `${prefix}${pattern}`)))]
      // Client mode sends guests to Auth's login path by default (`false` shows the 401 error instead).
      const redirectTo = options.redirectTo ?? (server ? undefined : authentication?.client?.redirect?.login)
      nuxt.options.runtimeConfig.public.authorization = { ...nuxt.options.runtimeConfig.public.authorization, routes, exempt, redirectTo: redirectTo || undefined }
    })

    // Only pages and `/api/**` are enforced. A rule for another server route (`/mcp`, `/oauth/**`) would do nothing
    // on the server, so say so once the pages are known (`build:before` covers an app without pages).
    let checkedUnenforced = false
    const warnUnenforced = (pagePaths: string[]) => {
      if (checkedUnenforced) return
      checkedUnenforced = true
      const configured = nuxt.options.runtimeConfig.public.authorization?.routes ?? {}
      const locales = ((nuxt.options as { i18n?: { locales?: (string | { code: string })[] } }).i18n?.locales ?? [])
        .map(locale => `/${typeof locale === 'string' ? locale : locale.code}`)
      const unenforced = findUnenforcedPatterns(Object.keys(configured), pagePaths, locales)
      if (unenforced.length) {
        logger.warn(
          `Route rules for ${unenforced.map(pattern => `"${pattern}"`).join(', ')} match no page and are not under /api/, so they are not enforced on the server. `
          + 'Guard those routes in their handler (authorize).',
        )
      }
    }

    // `definePageMeta({ authorize })` must name a registered permission: auth compiles the registry at `modules:done`
    // (`auth:access-compiled`), before the pages are resolved. Client mode has no registry (the issuer has it).
    let registry: PermissionRegistry | undefined
    nuxt.hook('auth:access-compiled', (access) => {
      registry = access.registry
    })
    nuxt.hook('pages:resolved', (pages) => {
      const paths: string[] = []
      const unknown: string[] = []
      const collect = (list: { path: string, file?: string, meta?: Record<string, unknown>, children?: unknown[] }[], base = '') => {
        for (const page of list) {
          const path = page.path.startsWith('/') ? page.path : `${base}/${page.path}`
          paths.push(path)
          const meta = page.meta?.authorize as AuthorizeMeta | undefined
          const permission = meta === undefined ? undefined : normalizeAuthorizeMeta(meta)?.permission
          if (registry && permission && !Object.hasOwn(registry.permissions, permission)) unknown.push(`${page.file ?? path}: "${permission}"`)
          collect((page.children ?? []) as typeof list, path)
        }
      }
      collect(pages as Parameters<typeof collect>[0])
      if (unknown.length) {
        throw new Error(`[@frigear-nu/authorization] \`definePageMeta({ authorize })\` names permissions that are not registered:\n- ${unknown.join('\n- ')}`)
      }
      warnUnenforced(paths)
    })
    nuxt.hook('build:before', () => warnUnenforced([]))

    // The host's shared policies run in the app's `can()` in both modes (Auth serves them as `#auth/shared-policies`).
    const sharedPolicies = policyFile(nuxt, options.policies?.shared, 'shared/policies')
    if (sharedPolicies) addPolicies(nuxt, { path: sharedPolicies, host: true, shared: true })

    if (server) {
      // The module's own permissions (`runtime/access.ts`).
      registerAccess(nuxt, authorizationAccess)
      // The host's roles merge into a module's role of the same name (`replace: true` drops the module's); auth compiles
      // them and fails the build on errors.
      addRole(nuxt, ...Object.entries(options.roles ?? {}).map(([name, role]) => ({ ...role, name, source: 'host' as const, replace: role.replace ?? false })))
      if (options.defaultRoles?.length) setDefaultRoles(nuxt, options.defaultRoles)
      setRoleProvider(nuxt, { path: resolver.resolve('./runtime/server/role-provider') })

      const serverPolicies = policyFile(nuxt, options.policies?.server, 'server/policies')
      if (serverPolicies) addPolicies(nuxt, { path: serverPolicies, host: true })

      // `authorization_user_roles` and `authorization_meta`; `users.role` stays this release for the migration only.
      // Host apps must generate and commit their own migration.
      registerDatabaseTable(nuxt, {
        resolver,
        schema: dialect => `./runtime/server/db/schema.${dialect}`,
      })
      extendDatabaseTable(nuxt, {
        resolver,
        file: dialect => `./runtime/server/db/users.${dialect}`,
      })
      addServerPlugin(resolver.resolve('./runtime/server/plugins/role-migration'))

      addModuleRoutes(resolver, [
        { method: 'get', path: 'roles', file: 'admin/roles.get' },
        { method: 'get', path: 'roles/:name', file: 'admin/role.get' },
        { method: 'get', path: 'roles/:name/users', file: 'admin/role-users.get' },
        { method: 'get', path: 'users/:id/roles', file: 'admin/user-roles.get' },
        { method: 'put', path: 'users/:id/roles', file: 'admin/user-roles.put' },
      ], { base: '/api/admin/authorization' })

      // Its pages live in the admin shell of `@frigear-nu/admin` (which brings `@frigear-nu/ui`), so they only exist with it.
      if (hasNuxtModule('@frigear-nu/admin', nuxt)) {
        const { adminRoute } = await import('@frigear-nu/admin/utils')
        const rolesPath = adminRoute(nuxt, 'roles')
        registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
        registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
        addModulePages('@frigear-nu/authorization', resolver, [
          { name: 'authorization-admin-roles', path: rolesPath, file: './runtime/app/pages/admin-roles.vue' },
          { name: 'authorization-admin-role', path: `${rolesPath}/:name`, file: './runtime/app/pages/admin-role.vue' },
        ])
        nuxt.options.runtimeConfig.public.authorization = { ...nuxt.options.runtimeConfig.public.authorization, pages: { roles: rolesPath } }
        addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/admin-menus'), menu: 'admin' })
        // A "Roles and permissions" tab on the users admin's user page (the `admin.users` tab area).
        if (hasNuxtModule('@frigear-nu/widget', nuxt)) {
          const { extendTabs } = await import('@frigear-nu/widget/utils')
          extendTabs(nuxt, 'admin.users', {
            id: 'roles',
            component: resolver.resolve('./runtime/app/tabs/UserRoles.vue'),
            order: 50,
            label: 'Roles and permissions',
            labelKey: 'authorization.admin.tabs.userRoles',
            icon: 'i-lucide-shield-check',
            permission: AUTHORIZATION_ROLES_READ,
          })
        }
      }
    }

    // Client: `useAuthorization()` ({ access, can, cannot, authorize, refresh }), `<Can>` / `<Cannot>`.
    addImports({ name: 'useAuthorization', from: resolver.resolve('./runtime/app/composables/useAuthorization') })
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })
    addPlugin(resolver.resolve('./runtime/app/plugins/access'))
    // Menu items with a `permission` are hidden from viewers without it (`menus:filter` of `@frigear-nu/menu`).
    if (hasNuxtModule('@frigear-nu/menu', nuxt)) addPlugin(resolver.resolve('./runtime/app/plugins/menu-filter'))
    // Widgets and tabs with a `permission` likewise (`widgets:filter` / `tabs:filter` of `@frigear-nu/widget`).
    if (hasNuxtModule('@frigear-nu/widget', nuxt)) addPlugin(resolver.resolve('./runtime/app/plugins/widget-filter'))

    // Transpiles the runtime (app and server), so server utils may rely on auto-imports.
    inlineModuleRuntime(nuxt, resolver)
    if (server) addServerImportsDir(resolver.resolve('./runtime/server/utils'))

    addRouteMiddleware({
      name: 'authorization',
      path: resolver.resolve('./runtime/app/middleware/authorization.global'),
      global: true,
    })

    // @deprecated `users.role` (server mode) / the id_token's `role` claim (client mode): removed with the column in the
    // next release. Access control reads roles from `authorization_user_roles`, never from here.
    addTypeTemplate({
      filename: 'types/authorization-user.d.ts',
      getContents: () => `declare module '#auth-utils' {
  interface User {
    /** @deprecated Not read by access control; use \`useAuthorization().access.roles\`. */
    role${server ? '' : '?'}: string
  }
}
export {}
`,
    }, { nitro: true, nuxt: true })
  },
})
