import {
  addServerImportsDir,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import { addModuleRoutes, registerDatabaseTable, registerLocales, registerTailwindSource, resolvePagePath, addOptionalMenuSource, addModulePages, inlineModuleRuntime } from '@frigear-nu/module-kit/utils'
import { addPermission, setAuthUserStore } from '@frigear-nu/auth/utils'
import type { ModuleRoute } from '@frigear-nu/module-kit/utils'
import type { ModuleOptions, PublicModuleOptions } from './types'

export type { AdminUserDto, ModuleOptions, ProfileDto, PublicModuleOptions } from './types'

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

    // Self-service: every signed-in user holds these (also without `@frigear-nu/authorization`). Email and password
    // changes are session only through `requireUser(event, { sessionOnly: true })`, not a permission.
    addPermission(nuxt,
      { name: 'profile:read', label: 'Read your profile', labelKey: 'users.permissions.profileRead', description: 'Read your own name, email and avatar.', group: 'profile', implicit: true },
      { name: 'profile:write', label: 'Change your profile', labelKey: 'users.permissions.profileWrite', description: 'Change your own name and avatar.', group: 'profile', implicit: true },
    )

    // Lets `@frigear-nu/auth` read and write users: sign-in flows, and the user a bearer token belongs to.
    setAuthUserStore(nuxt, resolver.resolve('./runtime/server/user-store'))

    // The emails this module sends, as templates @frigear-nu/email-templates renders when installed.
    nuxt.hook('notify:email:templates', sources => sources.push({ dir: resolver.resolve('./runtime/emails') }))
    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)

    // --- Self-service: the signed-in user changes their own profile, email and password --------------
    // Every route of the module, read off two tables (paths relative to `/api/users` and `/api/admin/users`;
    // `usersApi` in `runtime/utils/api.ts` builds the same URLs for app code and tests).
    const selfRoutes: ModuleRoute[] = [
      { method: 'patch', path: 'me', file: 'me/profile.patch' },
      { method: 'put', path: 'me/email', file: 'me/email.put' },
      { method: 'put', path: 'me/password', file: 'me/password.put' },
    ]

    if (settings.verifyEmailChange) {
      // The emailed links open pages (`/auth/verify-email-change`, `/auth/revert-email-change`) that only read
      // (GET); the change is applied by their buttons (POST), so mail scanners and link previews use nothing up.
      selfRoutes.push(
        { method: 'get', path: 'email-change', file: 'me/email-change.get' },
        { method: 'post', path: 'email-change/confirm', file: 'me/email-change-confirm.post' },
        { method: 'get', path: 'email-change/revert', file: 'me/email-change-revert.get' },
        { method: 'post', path: 'email-change/revert', file: 'me/email-change-revert.post' },
      )
      // The pages need `@nuxt/ui`, which may be installed by another module, so this waits until every module is set up.
      nuxt.hook('modules:done', () => {
        if (!hasNuxtModule('@nuxt/ui', nuxt)) {
          console.warn('[@frigear-nu/users] `settings.verifyEmailChange` is on, but `@nuxt/ui` is not installed: add your own pages at `/auth/verify-email-change` and `/auth/revert-email-change` (see the users module docs).')
          return
        }
        addModulePages('@frigear-nu/users', resolver, [
          { name: 'users-verify-email-change', path: '/auth/verify-email-change', file: './runtime/app/pages/verify-email-change.vue' },
          { name: 'users-revert-email-change', path: '/auth/revert-email-change', file: './runtime/app/pages/revert-email-change.vue' },
        ])
      })
      registerDatabaseTable(nuxt, {
        resolver,
        schema: dialect => `./runtime/db/email-changes.${dialect}`,
      })
    }
    addModuleRoutes(resolver, selfRoutes, { base: '/api/users' })

    if (settings.mcp === true) {
      const { addMcpDefinitions } = await import('@frigear-nu/mcp/utils')
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
      // Staff permissions, granted through roles (the host's `authorization.roles`; `admin: ['*']` covers them). Reads
      // also work for API tokens and OAuth access tokens given them. Deleting a user and anything that touches how
      // someone signs in (their email, sign-in links) is session only. Roles themselves are `@frigear-nu/authorization`'s.
      addPermission(nuxt,
        { name: 'users:read', label: 'View users', labelKey: 'users.permissions.read', description: 'See a user\'s profile, sign-in methods and what other modules show on the user page.', group: 'users' },
        { name: 'users:list', label: 'List users', labelKey: 'users.permissions.list', description: 'Search the user directory and see the sign-up numbers.', group: 'users' },
        { name: 'users:create', label: 'Add users', labelKey: 'users.permissions.create', description: 'Create users and email them a sign-in link.', group: 'users' },
        { name: 'users:update', label: 'Edit users', labelKey: 'users.permissions.update', description: 'Change a user\'s name.', group: 'users' },
        { name: 'users:delete', label: 'Delete users', labelKey: 'users.permissions.delete', description: 'Delete users and their sign-in methods.', group: 'users', sessionOnly: true },
        { name: 'users:manage', label: 'Manage sign-in of users', labelKey: 'users.permissions.manage', description: 'Change or verify a user\'s email address and email them a sign-in link.', group: 'users', sessionOnly: true },
      )

      // Static segments (`new`, `stats`) win over `:id` in the router.
      addModuleRoutes(resolver, [
        { method: 'get', path: '', file: 'admin/users.get' },
        { method: 'post', path: '', file: 'admin/users.post' },
        { method: 'get', path: 'new', file: 'admin/new.get' },
        { method: 'get', path: 'stats', file: 'admin/stats.get' },
        { method: 'get', path: ':id', file: 'admin/user.get' },
        { method: 'patch', path: ':id', file: 'admin/user.patch' },
        { method: 'delete', path: ':id', file: 'admin/user.delete' },
        { method: 'post', path: ':id/resend', file: 'admin/user-resend.post' },
      ], { base: '/api/admin/users' })

      if (adminPagePath) {
        addModulePages('@frigear-nu/users', resolver, [
          { name: 'users-admin', path: adminPagePath, file: './runtime/app/pages/admin.vue' },
          { name: 'users-admin-user', path: `${adminPagePath.replace(/\/+$/, '')}/:id(\\d+)`, file: './runtime/app/pages/admin-user.vue' },
        ])
      }

      // Contributes to the admin dashboard and owns the `admin.users` tab area of the user page (modules add tabs
      // with `extendTabs(nuxt, 'admin.users', ...)`) when @frigear-nu/widget is installed. Only with the admin shell: they
      // render inside its pages and use `@frigear-nu/ui`, which it brings.
      if (withAdminShell && hasNuxtModule('@frigear-nu/widget')) {
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
