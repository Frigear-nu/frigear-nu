import {
  addComponentsDir,
  addImports,
  addServerImportsDir,
  addServerPlugin,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  registerDatabaseTable,
  registerModule,
  registerLocales,
  registerTailwindSource,
  resolvePagePath,
  addModulePages,
  addOptionalMenuSource,
  inlineModuleRuntime,
  addModuleRoutes,
} from '@frigear-nu/module-kit/utils'
import { addPolicies, extendGrants, registerAccess } from '@frigear-nu/auth/utils'
import { teamsAccess } from './runtime/access'
import { mergeTeamLadders, teamLadderIssues } from './runtime/utils/ladders'
import { TEAMS_DASHBOARD, teamsDashboardItems } from './runtime/dashboard'
import type {
  ModuleOptions,
  PublicModuleOptions,
  TeamMemberContext,
  TeamMemberRoleChangedContext,
  TeamsMembersCandidatesContext,
  TeamsOwnerResolveContext,
  TeamsRolesResolveContext,
} from './types'

export type * from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    teams?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    teams: PublicModuleOptions
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** A member was added to a team (an explicit membership). */
    'teams:member:added': (ctx: TeamMemberContext) => void | Promise<void>
    /** An explicit membership was removed. */
    'teams:member:removed': (ctx: TeamMemberContext) => void | Promise<void>
    /** A member's role changed (`from` and `to` are role keys of the team kind's ladder). */
    'teams:member:role-changed': (ctx: TeamMemberRoleChangedContext) => void | Promise<void>
    /** Push mapped grants for mapping sources teams does not know (teams answers `plan` rules itself with subscriptions). */
    'teams:roles:resolve': (ctx: TeamsRolesResolveContext) => void | Promise<void>
    /** Add users who may hold a mapped role on a team, for `GET /api/teams/:id/members?include=mapped`. */
    'teams:members:candidates': (ctx: TeamsMembersCandidatesContext) => void | Promise<void>
    /**
     * Provider: label an owner and say whether it exists. Teams answers `team` and `operation`; an app adds its own
     * owner types here. Other modules that store `ownerType` / `ownerId` validate their owners through it.
     */
    'teams:owner:resolve': (ctx: TeamsOwnerResolveContext) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/teams'

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'teams' },
  defaults: {
    settings: { pages: {} },
  },
  moduleDependencies: {
    '@nuxthub/core': { version: '>=0.10' },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/auth': { version: '>=0.0.1' },
    // Members are users: the members list and the user lookup read the `users` table.
    '@frigear-nu/users': { version: '>=0.0.1' },
    '@frigear-nu/ui': { version: '>=0.0.1' },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
    '@frigear-nu/widget': { version: '>=0.0.0', optional: true },
    // Items on the `crew.home` dashboard.
    '@frigear-nu/dashboard': { version: '>=0.0.0', optional: true },
    // Provides the admin route and shell the admin pages live in; the page components come from `@frigear-nu/ui`.
    '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    // `teams:read`, `teams:lead`, `teams:manage`, `teams:pii` and the `teams` scope (`runtime/access.ts`).
    registerAccess(nuxt, teamsAccess, { from: MODULE_NAME })
    // The record rules of `teams:read` (members and staff) and `teams:lead` (the ladder's lead roles).
    addPolicies(nuxt, { path: resolver.resolve('./runtime/server/policies') })
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const settings = options.settings ?? {}

    // The built-in ladders: the generic `default` ladder, and the option's kinds over it (a kind there replaces the default).
    const ladders = mergeTeamLadders(options.ladders)
    for (const [kind, ladder] of Object.entries(ladders)) {
      const issues = teamLadderIssues(ladder)
      if (issues.length) throw new Error(`[teams] the ladder "${kind}" is invalid: ${issues.join(' ')}`)
    }
    const runtime = nuxt.options.runtimeConfig as unknown as Record<string, unknown>
    runtime.teams = { ...(runtime.teams as Record<string, unknown> | undefined), ladders }

    // The admin pages are opt-in and need `@frigear-nu/admin`.
    // `@frigear-nu/admin` is optional: its helper is only loaded when it is installed.
    let adminPath: string | undefined
    let adminTeamPath: string | undefined
    if (hasNuxtModule('@frigear-nu/admin')) {
      const { adminRoute } = await import('@frigear-nu/admin/utils')
      adminPath = resolvePagePath(settings.pages?.admin, adminRoute(nuxt, 'teams'))
      adminTeamPath = resolvePagePath(settings.pages?.adminTeam, adminRoute(nuxt, 'teams', ':id'))
    }
    nuxt.options.runtimeConfig.public.teams = { pages: { admin: adminPath, adminTeam: adminTeamPath } }

    // --- Database -------------------------------------------------------------------------
    registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // --- API routes -----------------------------------------------------------------------
    // Static segments (`me`, `mappings`, `ladders`, `users`) win over `:id` in h3's radix router.
    addModuleRoutes(resolver, [
      { method: 'get', path: 'me', file: 'me/teams.get' },
      { method: 'get', path: ':id', file: 'team.get' },
      { method: 'get', path: ':id/members', file: 'members.get' },
    ], { base: '/api/teams' })

    addModuleRoutes(resolver, [
      { method: 'get', path: '', file: 'admin/teams.get' },
      { method: 'post', path: '', file: 'admin/teams.post' },
      { method: 'get', path: 'mappings', file: 'admin/mappings.get' },
      { method: 'post', path: 'mappings', file: 'admin/mappings.post' },
      { method: 'patch', path: 'mappings/:id', file: 'admin/mapping.patch' },
      { method: 'delete', path: 'mappings/:id', file: 'admin/mapping.delete' },
      { method: 'get', path: 'ladders', file: 'admin/ladders.get' },
      { method: 'get', path: 'ladders/:kind', file: 'admin/ladder.get' },
      { method: 'put', path: 'ladders/:kind', file: 'admin/ladder.put' },
      { method: 'get', path: 'users', file: 'admin/users.get' },
      { method: 'get', path: ':id', file: 'admin/team.get' },
      { method: 'patch', path: ':id', file: 'admin/team.patch' },
      { method: 'delete', path: ':id', file: 'admin/team.delete' },
      { method: 'post', path: ':id/members', file: 'admin/member.post' },
      { method: 'patch', path: ':id/members/:userId', file: 'admin/member.patch' },
      { method: 'delete', path: ':id/members/:userId', file: 'admin/member.delete' },
    ], { base: '/api/admin/teams' })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)
    // Answers `teams:owner:resolve` for `team`, and for `operation` when the operations table is there.
    addServerPlugin(resolver.resolve('./runtime/server/plugins/owners'))
    // The `team` grant kind (`@frigear-nu/auth`): the users holding a minimum role on one team.
    extendGrants(nuxt, {
      kind: 'team',
      label: 'Team',
      labelKey: 'teams.grants.team',
      icon: 'i-lucide-users',
      server: resolver.resolve('./runtime/server/grants/team'),
      field: resolver.resolve('./runtime/app/grants/TeamGrantField.vue'),
      defaults: { teamId: '', minRole: '' },
      order: 20,
    })
    // Stores the option's ladders on the first request (insert-if-missing).
    addServerPlugin(resolver.resolve('./runtime/server/plugins/ladders'))

    // Optional integrations, checked once every module has registered (they may come after this one in `modules`).
    nuxt.hook('modules:done', () => {
      // `plan` mapping rules: an active subscription to the plan.
      if (hasNuxtModule('@frigear-nu/subscriptions', nuxt)) {
        addServerPlugin(resolver.resolve('./runtime/server/plugins/subscriptions'))
      }
      // The `teams` claim of id tokens and userinfo, with the `teams` / `teams:read` scope.
      if (hasNuxtModule('@frigear-nu/oauth-server', nuxt)) {
        addServerPlugin(resolver.resolve('./runtime/server/plugins/oauth-claims'))
      }
    })

    // --- App runtime ----------------------------------------------------------------------
    addImports([
      { name: 'useTeamLinks', from: resolver.resolve('./runtime/app/composables/useTeamLinks') },
      { name: 'useTeamActions', from: resolver.resolve('./runtime/app/composables/useTeamActions') },
      { name: 'useTeamMemberActions', from: resolver.resolve('./runtime/app/composables/useTeamMemberActions') },
      { name: 'useTeamMappingActions', from: resolver.resolve('./runtime/app/composables/useTeamMappingActions') },
      { name: 'useTeamsTranslate', from: resolver.resolve('./runtime/app/composables/useTeamsTranslate') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })

    addModulePages(MODULE_NAME, resolver, [
      { name: 'teams-admin', path: adminPath, file: './runtime/app/pages/admin.vue' },
      { name: 'teams-admin-team', path: adminTeamPath, file: './runtime/app/pages/admin-team.vue' },
    ])

    // A "Teams" tab on the staff operation page (`admin.operations`, owned by `@frigear-nu/operations`), without
    // importing operations: a tab for an area nobody renders is harmless.
    if (adminTeamPath && settings.operationsTab !== false && hasNuxtModule('@frigear-nu/widget')) {
      const { extendTabs } = await import('@frigear-nu/widget/utils')
      extendTabs(nuxt, 'admin.operations', {
        id: 'teams',
        component: resolver.resolve('./runtime/app/tabs/OwnerTeams.vue'),
        order: 20,
        label: 'Teams',
        labelKey: 'teams.admin.tabs.teams',
        icon: 'i-lucide-users-round',
        props: { ownerType: 'operation' },
        permission: teamsAccess.permissions.manage,
      })
    }

    // Dashboard: this module's items on `crew.home` (`runtime/dashboard.ts`).
    if (hasNuxtModule('@frigear-nu/dashboard')) {
      const { extendDashboard } = await import('@frigear-nu/dashboard/utils')
      extendDashboard(nuxt, TEAMS_DASHBOARD, teamsDashboardItems(path => resolver.resolve(path)))
    }

    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'admin.nav' })
  },
})
