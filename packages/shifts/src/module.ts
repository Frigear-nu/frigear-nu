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
import { addPolicies, registerAccess } from '@frigear-nu/auth/utils'
import { shiftsAccess } from './runtime/access'
import { SHIFTS_DEFAULT_PAGES } from './runtime/utils/links'
import { isValidTimeZone } from './runtime/utils/time'
import { normalizeReminderBatch, normalizeReminderOffsets } from './runtime/utils/reminders'
import type {
  ModuleOptions,
  PublicModuleOptions,
  ShiftAssignmentChangedContext,
  ShiftAttendanceContext,
  ShiftBroadcastContext,
  ShiftCreatedContext,
  ShiftPerkContext,
  ShiftReminderContext,
  ShiftScheduleContext,
  ShiftsRuntimeConfig,
  ShiftSwapContext,
  ShiftUpdatedContext,
} from './types'

export type * from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    shifts?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    shifts: PublicModuleOptions
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** A draft schedule was published: volunteers see their shifts in it from now on. */
    'shifts:schedule:published': (ctx: ShiftScheduleContext) => void | Promise<void>
    /** A shift was created (bulk creation and copying fire it per shift). */
    'shifts:shift:created': (ctx: ShiftCreatedContext) => void | Promise<void>
    /** A shift's times, place, capacity, notes, team or role changed. */
    'shifts:shift:updated': (ctx: ShiftUpdatedContext) => void | Promise<void>
    /** An assignment was created (`previous: null`), cancelled, marked or changed hands in a swap. */
    'shifts:assignment:changed': (ctx: ShiftAssignmentChangedContext) => void | Promise<void>
    /** Somebody offered on a swap: a shift in return (`kind: 'trade'`), or to take it over (`kind: 'release'`). */
    'shifts:swap:offered': (ctx: ShiftSwapContext) => void | Promise<void>
    /** The owner accepted an offer (`approval: 'peer'`: it completes at once; `'lead'`: it waits for a lead or staff). */
    'shifts:swap:accepted': (ctx: ShiftSwapContext) => void | Promise<void>
    /** The owner turned an offer down, or an approver rejected the swap. */
    'shifts:swap:rejected': (ctx: ShiftSwapContext) => void | Promise<void>
    /** The shift changed hands: both shifts together in a trade, the one shift in a release. */
    'shifts:swap:completed': (ctx: ShiftSwapContext) => void | Promise<void>
    /** A lead or staff marked attendance: a QR check-in, attended or a no-show. */
    'shifts:attendance:marked': (ctx: ShiftAttendanceContext) => void | Promise<void>
    /**
     * A reminder went out (`channels` says how). Fired by the `shifts:send-reminders` task, which has no request: `event`
     * is `undefined` here, unlike every other shifts hook.
     */
    'shifts:reminder:sent': (ctx: ShiftReminderContext) => void | Promise<void>
    /** A broadcast was sent to a team or shift. */
    'shifts:broadcast:sent': (ctx: ShiftBroadcastContext) => void | Promise<void>
    /** A lead redeemed a perk (a meal voucher, a drink) with a person's QR pass. */
    'shifts:perk:redeemed': (ctx: ShiftPerkContext) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/shifts'

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'shifts' },
  defaults: {
    settings: { pages: {} },
    timeZone: 'Europe/Copenhagen',
    checkInOpensMinutes: 60,
  },
  moduleDependencies: {
    '@nuxthub/core': { version: '>=0.10' },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/auth': { version: '>=0.0.1' },
    // People on shifts are users: names, emails and phone numbers come from the `users` table.
    '@frigear-nu/users': { version: '>=0.0.1' },
    '@frigear-nu/ui': { version: '>=0.0.1' },
    // Schedules hang off operations; shifts belong to an operation's teams; approved crew are the people on them.
    '@frigear-nu/operations': { version: '>=0.0.0' },
    '@frigear-nu/teams': { version: '>=0.0.0' },
    '@frigear-nu/crew': { version: '>=0.0.0' },
    // Swap, reminder and broadcast emails and texts go through notify.
    '@frigear-nu/notify': { version: '>=0.0.1' },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
    '@frigear-nu/widget': { version: '>=0.0.0', optional: true },
    // Provides the admin route and shell the operation page lives in.
    '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
    '@frigear-nu/mobile': { version: '>=0.0.0', optional: true },
    // Renders the `shifts-swap-*`, `shifts-reminder` and `shifts-broadcast` emails from the templates this module ships.
    '@frigear-nu/email-templates': { version: '>=0.0.1', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    // `shifts:read`, `shifts:swap`, `shifts:lead`, `shifts:manage`, `shifts:pii` and the `shifts` scope (`runtime/access.ts`).
    registerAccess(nuxt, shiftsAccess, { from: MODULE_NAME })
    // The record rules of `shifts:read`, `shifts:swap` and `shifts:lead`.
    addPolicies(nuxt, { path: resolver.resolve('./runtime/server/policies') })
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const settings = options.settings ?? {}

    const timeZone = options.timeZone || 'Europe/Copenhagen'
    if (!isValidTimeZone(timeZone)) throw new Error(`[shifts] \`timeZone\` "${timeZone}" is not a time zone this runtime knows.`)
    const checkInOpensMinutes = Math.max(0, Math.round(options.checkInOpensMinutes ?? 60))

    // The volunteer and lead pages are on unless a page is `false`.
    const shiftsPath = resolvePagePath(settings.pages?.shifts ?? true, SHIFTS_DEFAULT_PAGES.shifts)
    const shiftPath = resolvePagePath(settings.pages?.shift ?? true, SHIFTS_DEFAULT_PAGES.shift)
    const swapsPath = resolvePagePath(settings.pages?.swaps ?? true, SHIFTS_DEFAULT_PAGES.swaps)
    const checkInPath = resolvePagePath(settings.pages?.checkIn ?? true, SHIFTS_DEFAULT_PAGES.checkIn)
    const leadPath = resolvePagePath(settings.pages?.lead ?? true, SHIFTS_DEFAULT_PAGES.lead)
    nuxt.options.runtimeConfig.public.shifts = {
      pages: { shifts: shiftsPath, shift: shiftPath, swaps: swapsPath, checkIn: checkInPath, lead: leadPath },
      timeZone,
      checkInOpensMinutes,
    }
    const runtime = nuxt.options.runtimeConfig as unknown as Record<string, unknown>
    const reminders = { offsets: normalizeReminderOffsets(options.reminders?.offsets), sms: options.reminders?.sms === true, batchSize: normalizeReminderBatch(options.reminders?.batchSize) }
    runtime.shifts = { ...(runtime.shifts as Record<string, unknown> | undefined), timeZone, checkInOpensMinutes, reminders } satisfies ShiftsRuntimeConfig

    // --- Database -------------------------------------------------------------------------
    registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // --- API routes -----------------------------------------------------------------------
    // h3's router wants one parameter name per path segment: `:assignmentId`, `:swapId`, `:offerId`, `:teamId` and
    // `:operationId` each sit after their own static segment.
    addModuleRoutes(resolver, [
      { method: 'get', path: 'me', file: 'me/shifts.get' },
      // Static, so it wins over `me/:assignmentId`.
      { method: 'get', path: 'me/leads', file: 'me/leads.get' },
      { method: 'get', path: 'me/feed-token', file: 'me/feed-token.get' },
      { method: 'post', path: 'me/feed-token', file: 'me/feed-token.post' },
      { method: 'delete', path: 'me/feed-token', file: 'me/feed-token.delete' },
      { method: 'get', path: 'me/:assignmentId', file: 'me/shift.get' },
      { method: 'get', path: 'me/:assignmentId/pass', file: 'me/pass.get' },
      { method: 'post', path: 'me/:assignmentId/swap', file: 'me/swap.post' },
      { method: 'delete', path: 'me/:assignmentId/swap', file: 'me/swap.delete' },
      // The calendar feed: public, the secret in the path is the credential (`feed/<token>`, `.ics` suffix stripped by the handler).
      { method: 'get', path: 'feed/:token', file: 'feed/feed.get' },
      { method: 'get', path: 'swaps', file: 'swaps/list.get' },
      { method: 'post', path: 'swaps/:swapId/offers', file: 'swaps/offer.post' },
      { method: 'delete', path: 'swaps/:swapId/offers/:offerId', file: 'swaps/offer.delete' },
      { method: 'post', path: 'swaps/:swapId/offers/:offerId/accept', file: 'swaps/offer-accept.post' },
      { method: 'post', path: 'swaps/:swapId/offers/:offerId/reject', file: 'swaps/offer-reject.post' },
      { method: 'post', path: 'swaps/:swapId/approve', file: 'swaps/approve.post' },
      { method: 'post', path: 'swaps/:swapId/reject', file: 'swaps/reject.post' },
      { method: 'post', path: 'teams/:teamId/check-in', file: 'lead/check-in.post' },
      { method: 'get', path: 'teams/:teamId/shifts', file: 'lead/team-shifts.get' },
      { method: 'get', path: 'teams/:teamId/swaps', file: 'lead/team-swaps.get' },
      { method: 'post', path: 'teams/:teamId/broadcasts', file: 'lead/broadcast.post' },
      { method: 'get', path: 'teams/:teamId/perks', file: 'lead/perks.get' },
      { method: 'post', path: 'teams/:teamId/perks/:perkId/redeem', file: 'lead/perk-redeem.post' },
      { method: 'post', path: 'assignments/:assignmentId/attended', file: 'lead/attended.post' },
      { method: 'post', path: 'assignments/:assignmentId/no-show', file: 'lead/no-show.post' },
      { method: 'get', path: 'operations/:operationId/now', file: 'lead/now.get' },
    ], { base: '/api/shifts' })

    addModuleRoutes(resolver, [
      { method: 'get', path: 'schedules', file: 'admin/schedules.get' },
      { method: 'post', path: 'schedules', file: 'admin/schedules.post' },
      { method: 'get', path: 'schedules/:scheduleId', file: 'admin/schedule.get' },
      { method: 'patch', path: 'schedules/:scheduleId', file: 'admin/schedule.patch' },
      { method: 'delete', path: 'schedules/:scheduleId', file: 'admin/schedule.delete' },
      { method: 'post', path: 'schedules/:scheduleId/publish', file: 'admin/schedule-publish.post' },
      { method: 'post', path: 'schedules/:scheduleId/copy-from', file: 'admin/schedule-copy.post' },
      { method: 'get', path: 'schedules/:scheduleId/roles', file: 'admin/roles.get' },
      { method: 'post', path: 'schedules/:scheduleId/roles', file: 'admin/roles.post' },
      { method: 'get', path: 'schedules/:scheduleId/shifts', file: 'admin/shifts.get' },
      { method: 'post', path: 'schedules/:scheduleId/shifts/bulk', file: 'admin/shifts-bulk.post' },
      { method: 'patch', path: 'roles/:roleId', file: 'admin/role.patch' },
      { method: 'delete', path: 'roles/:roleId', file: 'admin/role.delete' },
      { method: 'delete', path: 'assignments/:assignmentId', file: 'admin/assignment.delete' },
      { method: 'get', path: 'swaps', file: 'admin/swaps.get' },
      { method: 'post', path: 'swaps/:swapId/cancel', file: 'admin/swap-cancel.post' },
      { method: 'get', path: 'operations/:operationId/teams', file: 'admin/operation-teams.get' },
      { method: 'get', path: 'broadcasts', file: 'admin/broadcasts.get' },
      { method: 'post', path: 'broadcasts', file: 'admin/broadcasts.post' },
      { method: 'get', path: 'operations/:operationId/perks', file: 'admin/perks.get' },
      { method: 'post', path: 'operations/:operationId/perks', file: 'admin/perks.post' },
      { method: 'patch', path: 'perks/:perkId', file: 'admin/perk.patch' },
      { method: 'delete', path: 'perks/:perkId', file: 'admin/perk.delete' },
      // A shift is the module's main resource: `/api/admin/shifts/:shiftId`. The static segments above win over it.
      { method: 'patch', path: ':shiftId', file: 'admin/shift.patch' },
      { method: 'delete', path: ':shiftId', file: 'admin/shift.delete' },
      { method: 'post', path: ':shiftId/assignments', file: 'admin/assignments.post' },
      { method: 'get', path: ':shiftId/candidates', file: 'admin/candidates.get' },
    ], { base: '/api/admin/shifts' })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)
    // Cancels future assignments when people leave a team or lose the role a shift needs.
    addServerPlugin(resolver.resolve('./runtime/server/plugins/teams'))

    // The `shifts-swap-*`, `shifts-reminder` and `shifts-broadcast` emails, as templates `@frigear-nu/email-templates` renders when installed.
    nuxt.hook('notify:email:templates', sources => sources.push({ dir: resolver.resolve('./runtime/emails') }))

    // --- Reminders ------------------------------------------------------------------------
    // The `shifts:send-reminders` Nitro task, on `reminders.cron` (every ten minutes unless set; `false` registers the
    // task without a schedule, to run it yourself). Like auth's housekeeping task it merges into `scheduledTasks`.
    const cron = options.reminders?.cron === undefined ? '*/10 * * * *' : options.reminders.cron
    nuxt.hook('nitro:config', (nitroConfig) => {
      nitroConfig.experimental ||= {}
      nitroConfig.experimental.tasks = true
      nitroConfig.tasks ||= {}
      nitroConfig.tasks['shifts:send-reminders'] = {
        handler: resolver.resolve('./runtime/server/tasks/send-reminders'),
        description: 'Email (and optionally text) people before their shifts start.',
      }
      if (cron) {
        nitroConfig.scheduledTasks ||= {}
        const existing = nitroConfig.scheduledTasks[cron]
        nitroConfig.scheduledTasks[cron] = [...(Array.isArray(existing) ? existing : existing ? [existing] : []), 'shifts:send-reminders']
      }
    })
    // nitropack 2 bundles `scheduledTasks` into the worker but never writes the cron expressions to wrangler.json, so
    // Cloudflare would never trigger them: mirror our cron into `triggers.crons` (a deduped union, so it works next to a
    // host that mirrors all of its own, as `apps/website` does).
    if (cron) {
      nuxt.hook('nitro:init', (nitro) => {
        if (!nitro.options.preset.startsWith('cloudflare')) return
        const wrangler = ((nitro.options.cloudflare ||= {}).wrangler ||= {})
        wrangler.triggers = { ...wrangler.triggers, crons: [...new Set([...(wrangler.triggers?.crons ?? []), cron])] }
      })
    }

    // --- App runtime ----------------------------------------------------------------------
    addImports([
      { name: 'useShiftsLinks', from: resolver.resolve('./runtime/app/composables/useShiftsLinks') },
      { name: 'useShiftsTranslate', from: resolver.resolve('./runtime/app/composables/useShiftsTranslate') },
      { name: 'useShiftsFormat', from: resolver.resolve('./runtime/app/composables/useShiftsFormat') },
      { name: 'useShiftsActions', from: resolver.resolve('./runtime/app/composables/useShiftsActions') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })

    addModulePages(MODULE_NAME, resolver, [
      { name: 'shifts-mine', path: shiftsPath, file: './runtime/app/pages/shifts.vue' },
      // The swaps page before the detail page: `/shifts/swaps` is not an assignment id.
      { name: 'shifts-swaps', path: swapsPath, file: './runtime/app/pages/swaps.vue' },
      { name: 'shifts-check-in', path: checkInPath, file: './runtime/app/pages/check-in.vue' },
      { name: 'shifts-lead', path: leadPath, file: './runtime/app/pages/lead.vue' },
      { name: 'shifts-shift', path: shiftPath, file: './runtime/app/pages/shift.vue' },
    ])

    // A "Shifts" tab on the staff operation page (`admin.operations`, owned by `@frigear-nu/operations`), after crew (10)
    // and teams (20).
    if (settings.operationsTab !== false && hasNuxtModule('@frigear-nu/widget') && hasNuxtModule('@frigear-nu/admin')) {
      const { extendTabs } = await import('@frigear-nu/widget/utils')
      extendTabs(nuxt, 'admin.operations', {
        id: 'shifts',
        component: resolver.resolve('./runtime/app/tabs/Shifts.vue'),
        order: 30,
        label: 'Shifts',
        labelKey: 'shifts.admin.tabs.shifts',
        icon: 'i-lucide-calendar-clock',
        permission: shiftsAccess.permissions.manage,
      })
    }

    // A "Shifts" tab in the mobile tab bar, on my shifts.
    if (shiftsPath && hasNuxtModule('@frigear-nu/mobile')) {
      const { extendMobileTabs } = await import('@frigear-nu/mobile/utils')
      extendMobileTabs(nuxt, {
        id: 'shifts',
        to: shiftsPath,
        label: 'Shifts',
        labelKey: 'shifts.mobile.tab',
        icon: 'i-lucide-calendar-clock',
        sfSymbol: 'calendar',
        sfSymbolActive: 'calendar.circle.fill',
        requiresAuth: true,
      })
    }

    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'account' })
  },
})
