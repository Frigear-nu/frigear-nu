import {
  addComponentsDir,
  addImports,
  addServerImportsDir,
  addServerPlugin,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  defineVirtualRegistry,
  registerDatabaseTable,
  extendDatabaseTable,
  registerModule,
  registerLocales,
  registerTailwindSource,
  resolvePagePath,
  addModulePages,
  addOptionalMenuSource,
  inlineModuleRuntime,
  addModuleRoutes,
} from '@frigear-nu/module-kit/utils'
import { addPolicies, registerAccess } from '@frigear-nu/auth/utils'
import { crewAccess } from './runtime/access'
import { CREW_DEFAULT_PAGES } from './runtime/utils/links'
import { CREW_DASHBOARD, crewDashboardItems } from './runtime/dashboard'
import { CREW_PUSH_MODULE_TYPES, crewNotificationTopics } from './runtime/notifications'
import type { CrewMemberContext, CrewRuntimeConfig, ModuleOptions, PublicModuleOptions } from './types'

export type * from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    crew?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    crew: PublicModuleOptions
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** Somebody applied to an operation's crew (or applied again after withdrawing). */
    'crew:member:applied': (ctx: CrewMemberContext) => void | Promise<void>
    /** Somebody joined the crew: approved by staff, promoted off the waiting list or through an invite. */
    'crew:member:approved': (ctx: CrewMemberContext) => void | Promise<void>
    /** An application was rejected, or an approved person was taken off the crew. */
    'crew:member:rejected': (ctx: CrewMemberContext) => void | Promise<void>
    /** Somebody is on the waiting list (over the capacity, or put there by staff). */
    'crew:member:waitlisted': (ctx: CrewMemberContext) => void | Promise<void>
    /** Somebody withdrew their application or their place. */
    'crew:member:withdrawn': (ctx: CrewMemberContext) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/crew'

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'crew' },
  defaults: {
    settings: { pages: {} },
  },
  moduleDependencies: {
    '@nuxthub/core': { version: '>=0.10' },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/auth': { version: '>=0.0.1' },
    // The crew are users: the member list, the phone number and the emails read the `users` table.
    '@frigear-nu/users': { version: '>=0.0.1' },
    '@frigear-nu/ui': { version: '>=0.0.1' },
    // Crew memberships are teams memberships, and an operation owns the teams.
    '@frigear-nu/operations': { version: '>=0.0.0' },
    '@frigear-nu/teams': { version: '>=0.0.0' },
    // Applications are submissions of a forms form, and status emails go through notify.
    '@frigear-nu/forms': { version: '>=0.0.1' },
    '@frigear-nu/notify': { version: '>=0.0.1' },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
    '@frigear-nu/widget': { version: '>=0.0.0', optional: true },
    // Items on the `crew.home` dashboard.
    '@frigear-nu/dashboard': { version: '>=0.0.0', optional: true },
    // The status message goes through `notifyUser` (email and push, by the person's choice).
    '@frigear-nu/push': { version: '>=0.0.0', optional: true },
    // Provides the admin route and shell the operation page lives in.
    '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
    '@frigear-nu/mobile': { version: '>=0.0.0', optional: true },
    // Renders the `crew-status-*` emails from the templates this module ships.
    '@frigear-nu/email-templates': { version: '>=0.0.1', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    // `crew:apply`, `crew:read`, `crew:manage`, `crew:pii`, `crew:invite` and the `crew` scope (`runtime/access.ts`).
    registerAccess(nuxt, crewAccess, { from: MODULE_NAME })
    // The record rule of `crew:read`: the person, the leads of their team, and staff.
    addPolicies(nuxt, { path: resolver.resolve('./runtime/server/policies') })
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const settings = options.settings ?? {}

    // The volunteer pages are on unless a page is `false`.
    const applyPath = resolvePagePath(settings.pages?.apply ?? true, CREW_DEFAULT_PAGES.apply)
    const statusPath = resolvePagePath(settings.pages?.status ?? true, CREW_DEFAULT_PAGES.status)
    const invitePath = resolvePagePath(settings.pages?.invite ?? true, CREW_DEFAULT_PAGES.invite)
    nuxt.options.runtimeConfig.public.crew = { pages: { apply: applyPath, status: statusPath, invite: invitePath } }
    const runtime = nuxt.options.runtimeConfig as unknown as Record<string, unknown>
    runtime.crew = {
      ...(runtime.crew as Record<string, unknown> | undefined),
      rolePresets: options.rolePresets ?? [],
      defaultTeamKind: options.defaultTeamKind ?? 'default',
      phoneField: options.phoneField ?? 'phone',
    } satisfies CrewRuntimeConfig

    // --- Database -------------------------------------------------------------------------
    registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })
    // The crew columns on teams' `team_members`, and the phone number on `users`. Hosts generate and commit their own
    // migrations for them.
    extendDatabaseTable(nuxt, {
      resolver,
      file: dialect => `./runtime/server/db/team-members.${dialect}`,
    })
    extendDatabaseTable(nuxt, {
      resolver,
      file: dialect => `./runtime/server/db/users.${dialect}`,
    })

    // --- API routes -----------------------------------------------------------------------
    addModuleRoutes(resolver, [
      { method: 'get', path: 'me', file: 'me/crew.get' },
      { method: 'post', path: 'me/:operationId/withdraw', file: 'me/withdraw.post' },
      { method: 'get', path: 'operations/:operation/apply', file: 'public/apply.get' },
      { method: 'post', path: 'invites/:token/accept', file: 'public/invite-accept.post' },
      // `:operation` like the apply route: h3's router wants one parameter name per segment.
      { method: 'get', path: 'operations/:operation/members', file: 'public/members.get' },
      { method: 'get', path: 'members/:id', file: 'public/member.get' },
    ], { base: '/api/crew' })

    addModuleRoutes(resolver, [
      { method: 'get', path: 'operations/:operationId/settings', file: 'admin/settings.get' },
      { method: 'put', path: 'operations/:operationId/settings', file: 'admin/settings.put' },
      { method: 'get', path: 'operations/:operationId/members', file: 'admin/members.get' },
      { method: 'post', path: 'operations/:operationId/members/approve', file: 'admin/members-approve.post' },
      { method: 'get', path: 'operations/:operationId/invites', file: 'admin/invites.get' },
      { method: 'post', path: 'operations/:operationId/invites', file: 'admin/invites.post' },
      { method: 'get', path: 'forms', file: 'admin/forms.get' },
      { method: 'patch', path: 'members/:id', file: 'admin/member.patch' },
      { method: 'post', path: 'members/:id/approve', file: 'admin/member-approve.post' },
      { method: 'post', path: 'members/:id/reject', file: 'admin/member-reject.post' },
      { method: 'post', path: 'members/:id/waitlist', file: 'admin/member-waitlist.post' },
      { method: 'get', path: 'members/:id/submission', file: 'admin/member-submission.get' },
      { method: 'delete', path: 'invites/:id', file: 'admin/invite.delete' },
    ], { base: '/api/admin/crew' })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)
    // Answers `audience:viewer:resolve` with the operations the user is approved crew of. Always on.
    addServerPlugin(resolver.resolve('./runtime/server/plugins/audience'))
    // Registers an application when the operation's crew form is submitted (`forms:submitted`).
    addServerPlugin(resolver.resolve('./runtime/server/plugins/forms'))

    // The `crew-status-*` emails, as templates `@frigear-nu/email-templates` renders when installed.
    nuxt.hook('notify:email:templates', sources => sources.push({ dir: resolver.resolve('./runtime/emails') }))

    // --- App runtime ----------------------------------------------------------------------
    addImports([
      { name: 'useCrewLinks', from: resolver.resolve('./runtime/app/composables/useCrewLinks') },
      { name: 'useCrewActions', from: resolver.resolve('./runtime/app/composables/useCrewActions') },
      { name: 'useCrewTranslate', from: resolver.resolve('./runtime/app/composables/useCrewTranslate') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })

    addModulePages(MODULE_NAME, resolver, [
      { name: 'crew-apply', path: applyPath, file: './runtime/app/pages/apply.vue' },
      { name: 'crew-status', path: statusPath, file: './runtime/app/pages/status.vue' },
      { name: 'crew-invite', path: invitePath, file: './runtime/app/pages/invite.vue' },
    ])

    // A "Crew" tab on the staff operation page (`admin.operations`, owned by `@frigear-nu/operations`), without importing
    // operations: a tab for an area nobody renders is harmless. Before teams' tab (order 20).
    if (settings.operationsTab !== false && hasNuxtModule('@frigear-nu/widget') && hasNuxtModule('@frigear-nu/admin')) {
      const { extendTabs } = await import('@frigear-nu/widget/utils')
      extendTabs(nuxt, 'admin.operations', {
        id: 'crew',
        component: resolver.resolve('./runtime/app/tabs/Crew.vue'),
        order: 10,
        label: 'Crew',
        labelKey: 'crew.admin.tabs.crew',
        icon: 'i-lucide-hand-heart',
        permission: crewAccess.permissions.manage,
      })
    }

    // A "Crew" tab in the mobile tab bar, on the status page.
    if (statusPath && hasNuxtModule('@frigear-nu/mobile')) {
      const { extendMobileTabs } = await import('@frigear-nu/mobile/utils')
      extendMobileTabs(nuxt, {
        id: 'crew',
        to: statusPath,
        label: 'Crew',
        labelKey: 'crew.mobile.tab',
        icon: 'i-lucide-hand-heart',
        sfSymbol: 'person.3',
        sfSymbolActive: 'person.3.fill',
        requiresAuth: true,
      })
    }

    // Push: the `crew.status` topic, and `notifyUser` for the status message (`crew-send.ts`) through a server module that
    // is `undefined` when push is not installed, so crew keeps sending the email itself then.
    defineVirtualRegistry(nuxt, {
      filename: '#crew/push',
      target: 'server',
      collect: () => hasNuxtModule('@frigear-nu/push', nuxt),
      contents: installed => installed
        ? 'export { notifyUser } from \'#imports\'\nexport const pushAvailable = true\n'
        : 'export const notifyUser = undefined\nexport const pushAvailable = false\n',
    })
    addTypeTemplate({ filename: 'types/crew-push.d.ts', getContents: () => CREW_PUSH_MODULE_TYPES }, { nuxt: true, nitro: true })
    if (hasNuxtModule('@frigear-nu/push')) {
      const { extendNotificationTopics } = await import('@frigear-nu/push/utils')
      extendNotificationTopics(nuxt, crewNotificationTopics)
    }

    // Dashboard: this module's items on `crew.home` (`runtime/dashboard.ts`).
    if (hasNuxtModule('@frigear-nu/dashboard')) {
      const { extendDashboard } = await import('@frigear-nu/dashboard/utils')
      extendDashboard(nuxt, CREW_DASHBOARD, crewDashboardItems(path => resolver.resolve(path)))
    }

    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'account' })
  },
})
