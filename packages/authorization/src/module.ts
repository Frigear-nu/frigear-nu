import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  addComponentsDir,
  addImports,
  addRouteMiddleware,
  addServerHandler,
  addServerImports,
  addServerImportsDir,
  addServerPlugin,
  addServerTemplate,
  addTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
  useLogger,
} from '@nuxt/kit'
import type { ModuleDependencyMeta, Nuxt } from '@nuxt/schema'
import { addModulePages, addModuleRoutes, addOptionalMenuSource, extendDatabaseTable, registerLocales, registerModule, registerTailwindSource, inlineModuleRuntime } from '@frigear-nu/module-kit/utils'
import { addAuthScope } from '@frigear-nu/auth/utils'
import type { AuthRoleDefinition, AuthScopeDefinition } from '@frigear-nu/auth/utils'
import { resolveAuthMode } from '@frigear-nu/auth/mode'
import { ROUTE_RULE_KEYS } from './runtime/utils/types'
import { findUnenforcedPatterns } from './runtime/utils/rules'
import { AUTHORIZATION_ROLES_READ_SCOPE, compileRbac } from './runtime/utils/rbac'
import type { RbacTable } from './runtime/utils/rbac'
import type { AuthorizationRouteRules, ModuleOptions, PublicModuleOptions } from './types'

export type { AuthorizationAuthorizeContext, AuthorizationPermissionMatrixDto, AuthorizationPermissionsDto, AuthorizationRoleContext, AuthorizationRoleDto, AuthorizationRolePermissionDto, AuthorizationRoleSummaryDto, AuthorizationRoleUserDto, AuthorizationRoleUsersPageDto, AuthorizationRouteRules, ModuleOptions, PublicModuleOptions, PublicRbacTable, RbacConfig, RbacGrant, RbacRole, RbacRoleInput, RbacRoleSource, RbacTable } from './types'
export type { Ability, AbilityArgs, AuthorizeMeta, RouteRule, AuthorizationResponse } from './runtime/utils/types'

declare module 'nuxt/schema' {
  interface NuxtConfig {
    authorization?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    authorization?: PublicModuleOptions
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/authorization', configKey: 'authorization' },
  defaults: {
    resolvers: {},
  },
  // The mode is the app's own `authentication.mode` (`resolveAuthMode`). Client mode has no server: the rules only
  // decide what the app shows, the API decides what is allowed.
  moduleDependencies: (nuxt: Nuxt): Record<string, ModuleDependencyMeta> => resolveAuthMode(nuxt) === 'client'
    ? {
        '@frigear-nu/module-kit': { version: '>=0.0.1' },
        '@frigear-nu/auth': { version: '>=0.0.1' },
      }
    : {
        '@nuxthub/core': {
          version: '>=0.10',
        },
        '@frigear-nu/module-kit': {
          version: '>=0.0.1',
        },
        '@frigear-nu/auth': {
          version: '>=0.0.1',
        },
        '@frigear-nu/users': {
          version: '>=0.0.1',
        },
        // The roles admin (`rbac`): pages in the admin shell, its sidebar entry and a tab on the user page.
        '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
        '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
        '@frigear-nu/widget': { version: '>=0.0.0', optional: true },
      },
  async setup(options, nuxt) {
    registerModule('@frigear-nu/authorization', nuxt)
    const resolver = createResolver(import.meta.url)
    const server = resolveAuthMode(nuxt) === 'server'

    nuxt.options.runtimeConfig.public.authorization = {
      routes: {},
      exempt: [],
      redirectTo: options.redirectTo || undefined,
    }
    // `definePageMeta({ authorize })` in `pages:resolved` too (`@frigear-nu/mobile` checks that something is guarded).
    nuxt.options.experimental.extraPageMetaExtractionKeys = [...new Set([...(nuxt.options.experimental.extraPageMetaExtractionKeys ?? []), 'authorize'])]

    // Rules are keys on the native `routeRules` (`'/admin/**': { roles: ['admin'] }`). Nuxt's app-side route
    // rules matcher only keeps known keys, so they are collected here (once every module has had its say)
    // and shipped through public runtime config.
    nuxt.hook('modules:done', () => {
      const routes: Record<string, AuthorizationRouteRules> = {}
      const sources = [nuxt.options.routeRules, nuxt.options.nitro?.routeRules]
      for (const [pattern, rule] of sources.flatMap(source => Object.entries(source ?? {}))) {
        const picked = Object.fromEntries(ROUTE_RULE_KEYS
          .filter(key => (rule as Record<string, unknown>)[key] !== undefined)
          .map(key => [key, (rule as Record<string, unknown>)[key]]))
        if (Object.keys(picked).length) routes[pattern] = { ...routes[pattern], ...picked }
      }
      // The anonymous entry points of Auth (sign-in pages, the callback, `/api/auth/**`) stay reachable under any
      // less specific guard (`'/**': { authenticated: true }`), pages and API alike. App rules for the same or a more
      // specific pattern still apply (`resolveRule`).
      // With @nuxtjs/i18n every page also exists under `/<locale>/...` (the API does not).
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
        useLogger('@frigear-nu/authorization').warn(
          `Route rules for ${unenforced.map(pattern => `"${pattern}"`).join(', ')} match no page and are not under /api/, so they are not enforced on the server. `
          + 'Guard those routes in their handler (requireAuth).',
        )
      }
    }
    nuxt.hook('pages:resolved', (pages) => {
      const paths: string[] = []
      const collect = (list: { path: string, children?: unknown[] }[], base = '') => {
        for (const page of list) {
          const path = page.path.startsWith('/') ? page.path : `${base}/${page.path}`
          paths.push(path)
          collect((page.children ?? []) as { path: string, children?: unknown[] }[], path)
        }
      }
      collect(pages as { path: string, children?: unknown[] }[])
      warnUnenforced(paths)
    })
    nuxt.hook('build:before', () => warnUnenforced([]))

    // `users.role` (default 'user'). Host apps must generate and commit their own migration.
    if (server) {
      extendDatabaseTable(nuxt, {
        resolver,
        file: dialect => `./runtime/server/db/schema.${dialect}`,
      })
    }

    // Role-based access control: compile the built-in roles, the roles and permission mappings modules registered with
    // `@frigear-nu/auth` (`addAuthRole`, `aggregateTo`) and the host's `roles` into one table, once every module ran.
    const rbac = server && options.rbac === true
    if (options.rbac && !server) {
      useLogger('@frigear-nu/authorization').warn('`rbac` needs server mode: the API of a client-mode app decides what is allowed.')
    }
    let rbacTable: RbacTable | null = null
    if (rbac) {
      nuxt.hook('modules:done', async () => {
        const authentication = (nuxt.options as { authentication?: { scopes?: AuthScopeDefinition[] } }).authentication
        const scopes: AuthScopeDefinition[] = [...(authentication?.scopes ?? [])]
        await nuxt.callHook('auth:scopes', scopes)
        const moduleRoles: AuthRoleDefinition[] = []
        await nuxt.callHook('auth:roles', moduleRoles)
        const result = compileRbac({ scopes, moduleRoles, config: options.roles })
        if (result.errors.length) {
          throw new Error(`[@frigear-nu/authorization] Invalid roles:\n- ${result.errors.join('\n- ')}`)
        }
        const logger = useLogger('@frigear-nu/authorization')
        for (const warning of result.warnings) logger.info(warning)
        rbacTable = result.table
        nuxt.options.runtimeConfig.public.authorization = {
          ...nuxt.options.runtimeConfig.public.authorization,
          rbac: {
            defaultRole: result.table.defaultRole,
            roles: result.table.roles.map(role => ({ name: role.name, label: role.label, permissions: role.permissions })),
          },
        }
      })
      addServerTemplate({
        filename: '#authorization/rbac',
        getContents: () => `export const rbac = ${JSON.stringify(rbacTable)}`,
      })
      addServerPlugin(resolver.resolve('./runtime/server/plugins/rbac'))

      // The roles admin: read-only views of the table, for staff holding `roles:read` (admin only unless granted).
      addAuthScope(nuxt, { name: AUTHORIZATION_ROLES_READ_SCOPE, description: 'See the roles and what each may do (staff)' })
      addModuleRoutes(resolver, [
        { method: 'get', path: 'roles', file: 'admin/roles.get' },
        { method: 'get', path: 'roles/:name', file: 'admin/role.get' },
        { method: 'get', path: 'roles/:name/users', file: 'admin/role-users.get' },
        { method: 'get', path: 'permissions', file: 'admin/permissions.get' },
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
        // A "Permissions" tab on the users admin's user page (the `admin.users` tab area).
        if (hasNuxtModule('@frigear-nu/widget', nuxt)) {
          const { extendTabs } = await import('@frigear-nu/widget/utils')
          extendTabs(nuxt, 'admin.users', {
            id: 'permissions',
            component: resolver.resolve('./runtime/app/tabs/UserPermissions.vue'),
            order: 50,
            label: 'Permissions',
            labelKey: 'authorization.admin.tabs.permissions',
            icon: 'i-lucide-shield-check',
          })
        }
      }
    }
    if (server) {
      if (!rbac) addServerTemplate({ filename: '#authorization/rbac', getContents: () => 'export const rbac = null' })
      addModuleRoutes(resolver, [
        { method: 'get', path: 'me/permissions', file: 'me/permissions.get' },
      ], { base: '/api/authorization' })
    }

    // Resolvers: the configured function (or the nuxt-auth-utils session user) is re-exported through
    // virtual modules so the runtime can import it statically, like `#users/session-mapper`.
    const resolverSource = async (configured: string | undefined, fallback: string) => {
      const target = configured
        ? await resolver.resolvePath(configured, { cwd: nuxt.options.rootDir })
        : resolver.resolve(fallback)
      return `export { default } from ${JSON.stringify(target)}`
    }

    // Abilities registry: lets `routes` and `definePageMeta({ authorize: 'name' })` refer to abilities by name.
    const abilitiesFile = options.abilities
      ? await resolver.resolvePath(options.abilities, { cwd: nuxt.options.rootDir })
      : ['shared/utils/abilities.ts', 'shared/abilities.ts'].map(file => join(nuxt.options.rootDir, file)).find(existsSync)
    const abilitiesSource = abilitiesFile
      ? `import * as abilities from ${JSON.stringify(abilitiesFile)}\nexport { abilities }`
      : 'export const abilities = {}'

    if (server) {
      addServerTemplate({
        filename: '#authorization/server-resolver',
        getContents: () => resolverSource(options.resolvers?.server, './runtime/server/resolver'),
      })
      addServerTemplate({
        filename: '#authorization/abilities',
        getContents: () => abilitiesSource,
      })
    }
    addTemplate({
      filename: 'authorization/client-resolver.mjs',
      write: true,
      getContents: () => resolverSource(options.resolvers?.client, './runtime/app/resolver'),
    })
    addTemplate({
      filename: 'authorization/abilities.mjs',
      write: true,
      getContents: () => abilitiesSource,
    })

    // Types: virtual modules + the `role` column on the session user.
    addTypeTemplate({
      filename: 'types/authorization-virtual.d.ts',
      getContents: () => `declare module '#authorization/server-resolver' {
  const resolveServerUser: (event: import('h3').H3Event) => unknown | Promise<unknown>
  export default resolveServerUser
}
declare module '#authorization/abilities' {
  export const abilities: Record<string, unknown>
}
declare module '#authorization/rbac' {
  export const rbac: import(${JSON.stringify(resolver.resolve('./runtime/utils/rbac'))}).RbacTable | null
}
declare module '#build/authorization/client-resolver.mjs' {
  const resolveClientUser: () => unknown | Promise<unknown>
  export default resolveClientUser
}
declare module '#build/authorization/abilities.mjs' {
  export const abilities: Record<string, unknown>
}
`,
    }, { nitro: true, nuxt: true })
    // Server mode: the `users.role` column (always set). Client mode: the id_token's `role` claim, when there is one.
    addTypeTemplate({
      filename: 'types/authorization-user.d.ts',
      getContents: () => `declare module '#auth-utils' {
  interface User {
    role${server ? '' : '?'}: string
  }
}
export {}
`,
    }, { nitro: true, nuxt: true })

    // Shared policy helpers (client + server).
    const abilityImports = ['defineAbility', 'allow', 'deny'].map(name => ({
      name,
      from: resolver.resolve('./runtime/utils/ability'),
    }))
    addImports(abilityImports)
    if (server) addServerImports(abilityImports)

    // Client: `allows`, `denies`, `authorize`, `useAuthorization`.
    addImports(['allows', 'denies', 'authorize', 'useAuthorization'].map(name => ({
      name,
      from: resolver.resolve('./runtime/app/composables/useAuthorization'),
    })))
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })

    // Server: `allows(event, ...)`, `denies(event, ...)`, `authorize(event, ...)`.
    // Transpiles the app runtime too, so it runs in both modes.
    inlineModuleRuntime(nuxt, resolver)
    if (server) addServerImportsDir(resolver.resolve('./runtime/server/utils'))

    addRouteMiddleware({
      name: 'authorization',
      path: resolver.resolve('./runtime/app/middleware/authorization.global'),
      global: true,
    })

    // Cheap when no `routeRules` carry an `authorization` entry: only `/api/**` requests are inspected.
    if (server) {
      addServerHandler({
        middleware: true,
        handler: resolver.resolve('./runtime/server/middleware/authorization'),
      })
    }
  },
})
