import {
  addServerHandler,
  addServerImportsDir,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import { moduleApiUrl, registerDatabaseTable, registerLocales, registerTailwindSource, resolvePagePath, addOptionalMenuSource, addModulePages, inlineModuleRuntime } from '@frigear-nu/module-kit/utils'
import { addAuthScope, setAuthUserStore } from '@frigear-nu/auth/utils'
import type { UsersAdminContext, UsersAdminRolesContext } from './runtime/server/utils/admin'
import type { ModuleOptions, PublicModuleOptions } from './types'

export type { ModuleOptions, PublicModuleOptions } from './types'

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** Staff gate of the users admin (`settings.admin`): set `ctx.allowed = true` to allow `ctx.action`. Denied by default. */
    'users:admin:authorize': (ctx: UsersAdminContext) => void | Promise<void>
    /** Roles the signed-in user may assign in the users admin: set `ctx.roles`. Defaults to the roles in use. */
    'users:admin:roles': (ctx: UsersAdminRolesContext) => void | Promise<void>
  }
}

declare module 'nuxt/schema' {
  interface NuxtConfig {
    users?: ModuleOptions
  }

  interface RuntimeConfig {
    users?: { verifyEmailChange: boolean }
  }

  interface PublicRuntimeConfig {
    users?: PublicModuleOptions
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/users', configKey: 'users' },
  defaults: {
    settings: {},
  },
  // `@frigear-nu/mcp` is only installed when `settings.mcp` is on.
  moduleDependencies: nuxt => ({
    '@nuxthub/core': {
      version: '>=0.0.1',
    },
    '@frigear-nu/module-kit': {
      version: '>=0.0.1',
    },
    // Sign-in, sessions and `requireAuth`: the users module only says who the users are.
    '@frigear-nu/auth': {
      version: '>=0.0.1',
    },
    // Email and password change notices are dispatched through it.
    '@frigear-nu/notify': {
      version: '>=0.0.1',
    },
    '@frigear-nu/menu': {
      version: '>=0.0.1',
      optional: true,
    },
    '@frigear-nu/widget': {
      version: '>=0.0.0',
      optional: true,
    },
    // The admin shell and, through `@frigear-nu/ui`, the page patterns (`PageHeading`, `TableCard`, ...) the admin pages use.
    '@frigear-nu/admin': {
      version: '>=0.0.0',
      optional: true,
    },
    ...(nuxt.options.users?.settings?.mcp === true ? { '@frigear-nu/mcp': { version: '>=0.0.1' } } : {}),
  }),
  async setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const settings = options.settings ?? {}

    registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/db/schema.${dialect}`,
    })

    // Lets `@frigear-nu/auth` read and write users: sign-in flows, and the user a bearer token belongs to.
    setAuthUserStore(nuxt, resolver.resolve('./runtime/server/user-store'))

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)

    // --- Self-service: the signed-in user changes their own profile, email and password --------------
    for (const [path, file] of [
      ['me/profile', 'profile.post'],
      ['me/change-email', 'change-email.post'],
      ['me/change-password', 'change-password.post'],
    ] as const) {
      addServerHandler({ route: moduleApiUrl('users', path), method: 'post', handler: resolver.resolve(`./runtime/server/routes/me/${file}`) })
    }

    if (settings.verifyEmailChange) {
      for (const file of ['verify-email-change', 'revert-email-change']) {
        addServerHandler({
          route: `/auth/${file}`,
          method: 'get',
          handler: resolver.resolve(`./runtime/server/routes/me/${file}.get`),
        })
      }
      registerDatabaseTable(nuxt, {
        resolver,
        schema: dialect => `./runtime/db/email-changes.${dialect}`,
      })
    }

    if (settings.mcp === true) {
      const { addMcpDefinitions } = await import('@frigear-nu/mcp/utils')
      addAuthScope(nuxt, { name: 'profile:read', description: 'Read your own name, email and role (MCP)' })
      addMcpDefinitions(nuxt, resolver.resolve('./runtime/server/mcp'))
    }

    nuxt.options.runtimeConfig.users = { verifyEmailChange: settings.verifyEmailChange === true }

    // --- User administration (staff) ---------------------------------------------------------
    const withAdmin = !!settings.admin
    const adminOptions = typeof settings.admin === 'object' ? settings.admin : {}
    // The admin pages live in the admin shell of `@frigear-nu/admin`, so they only exist with it.
    const withAdminShell = hasNuxtModule('@frigear-nu/admin')
    if (withAdmin && !withAdminShell) {
      console.warn('[@frigear-nu/users] `settings.admin` is on, but `@frigear-nu/admin` is not installed: the admin API is registered, the admin pages are not.')
    }
    const adminPagePath = withAdmin && withAdminShell
      ? resolvePagePath(adminOptions.page ?? true, (await import('@frigear-nu/admin/utils')).adminRoute(nuxt, 'users'))
      : undefined

    if (withAdmin) {
      for (const [method, path, file] of [
        ['get', '/api/admin/users', 'users.get'],
        ['post', '/api/admin/users', 'users.post'],
        ['get', '/api/admin/users/new', 'new.get'],
        ['get', '/api/admin/users/stats', 'stats.get'],
        ['get', '/api/admin/users/roles', 'roles.get'],
        ['get', '/api/admin/users/:id', 'user.get'],
        ['patch', '/api/admin/users/:id', 'user.patch'],
        ['delete', '/api/admin/users/:id', 'user.delete'],
        ['post', '/api/admin/users/:id/resend', 'user-resend.post'],
      ] as const) {
        addServerHandler({ route: path, method, handler: resolver.resolve(`./runtime/server/routes/admin/${file}`) })
      }

      if (adminPagePath) {
        addModulePages('@frigear-nu/users', resolver, [
          { name: 'users-admin', path: adminPagePath, file: './runtime/app/pages/admin.vue' },
          { name: 'users-admin-user', path: `${adminPagePath.replace(/\/+$/, '')}/:id(\\d+)`, file: './runtime/app/pages/admin-user.vue' },
        ])
      }

      // Contributes to the admin dashboard and owns the `admin.users` tab area of the user page (modules add tabs
      // with `extendTabs(nuxt, 'admin.users', ...)`) when @frigear-nu/widget is installed.
      if (hasNuxtModule('@frigear-nu/widget')) {
        const { extendWidgets, extendTabs } = await import('@frigear-nu/widget/utils')
        extendTabs(nuxt, 'admin.users', {
          id: 'overview',
          component: resolver.resolve('./runtime/app/tabs/Overview.vue'),
          order: 0,
          label: 'Overview',
          labelKey: 'users.admin.tabs.overview',
          icon: 'i-lucide-user',
        })
        extendWidgets(nuxt, 'admin.dashboard', {
          id: 'users-new-users',
          component: resolver.resolve('./runtime/app/widgets/NewUsers.vue'),
          order: 20,
          span: 2,
        })
        extendWidgets(nuxt, 'admin.dashboard.top', {
          id: 'users-new-users-stat',
          component: resolver.resolve('./runtime/app/widgets/NewUsersStat.vue'),
          order: 10,
        })
      }
    }

    if (adminPagePath) {
      addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/admin-menus'), menu: 'admin' })
    }

    nuxt.options.runtimeConfig.public.users = {
      profilePath: settings.profilePath,
      mcp: settings.mcp === true,
      pages: { admin: adminPagePath },
    }
  },
})
