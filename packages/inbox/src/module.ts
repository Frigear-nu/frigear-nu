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
import type { Nuxt } from '@nuxt/schema'
import {
  addModulePages,
  addModuleRoutes,
  addOptionalMenuSource,
  defineVirtualRegistry,
  inlineModuleRuntime,
  registerDatabaseTable,
  registerLocales,
  registerModule,
  registerTailwindSource,
  resolvePagePath,
} from '@frigear-nu/module-kit/utils'
import { addPolicies, registerAccess } from '@frigear-nu/auth/utils'
import { inboxAccess } from './runtime/access'
import { buildInboxRegistry } from './runtime/utils/registry'
import type { BuiltInboxRegistry } from './runtime/utils/registry'
import type {
  InboxExtension,
  InboxMessageContext,
  InboxRuntimeConfig,
  InboxThreadAssignedContext,
  InboxThreadStatusContext,
  ModuleOptions,
  PublicModuleOptions,
} from './types'

export type * from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    inbox?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    inbox: PublicModuleOptions
  }

  interface RuntimeConfig {
    inbox: InboxRuntimeConfig
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** A message came in on a channel (a webhook, the contact form) and was stored. Not for a duplicate delivery. */
    'inbox:message:received': (ctx: InboxMessageContext) => void | Promise<void>
    /** A reply went out through the thread's channel and was stored. Notes fire nothing. */
    'inbox:message:sent': (ctx: InboxMessageContext) => void | Promise<void>
    /** A thread got another assignee (`null`: unassigned); `previous` is the one before. */
    'inbox:thread:assigned': (ctx: InboxThreadAssignedContext) => void | Promise<void>
    /** A thread's status changed: by staff, or a closed thread reopened by a new message. */
    'inbox:thread:status-changed': (ctx: InboxThreadStatusContext) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/inbox'

type InboxInNuxt = ModuleOptions & { _extensions?: InboxExtension[] }

/** The built-in channels: the contact form, email and the three Meta channels. */
function builtInExtension(resolve: (path: string) => string): InboxExtension {
  return {
    channels: [
      { id: 'form', label: { da: 'Kontaktformular', en: 'Contact form' }, icon: 'i-lucide-file-text', adapter: resolve('./runtime/channels/form') },
      { id: 'email', label: { da: 'E-mail', en: 'Email' }, icon: 'i-lucide-mail', adapter: resolve('./runtime/channels/email') },
      { id: 'whatsapp', label: 'WhatsApp', icon: 'i-lucide-message-circle', adapter: resolve('./runtime/channels/whatsapp') },
      { id: 'messenger', label: 'Messenger', icon: 'i-lucide-messages-square', adapter: resolve('./runtime/channels/messenger') },
      { id: 'instagram', label: 'Instagram', icon: 'i-lucide-instagram', adapter: resolve('./runtime/channels/instagram') },
    ],
  }
}

/** The server registry: the channels and their adapters, imported statically. */
function serverRegistryTemplate(registry: BuiltInboxRegistry): string {
  const ids = Object.keys(registry.adapters)
  const lines = ids.map((id, index) => `import adapter${index} from ${JSON.stringify(registry.adapters[id])}`)
  lines.push(`export const channels = ${JSON.stringify(registry.channels)}`)
  lines.push(`export const adapters = {${ids.map((id, index) => `${JSON.stringify(id)}: adapter${index}`).join(', ')}}`)
  return `${lines.join('\n')}\n`
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'inbox' },
  defaults: {
    settings: { pages: {} },
  },
  moduleDependencies: {
    '@nuxthub/core': { version: '>=0.10' },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/auth': { version: '>=0.0.1' },
    '@frigear-nu/notify': { version: '>=0.0.1' },
    '@frigear-nu/ui': { version: '>=0.0.1' },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
    '@frigear-nu/widget': { version: '>=0.0.0', optional: true },
    // Provides the admin route and shell the staff pages live in; the page components come from `@frigear-nu/ui`.
    '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    // `inbox:read`, `:reply`, `:assign`, `:hide`, `:manage`, `inbox:pii`, `inbox:channels`,
    // `inbox-audit:pii` and the `inbox` scope (`runtime/access.ts`).
    registerAccess(nuxt, inboxAccess, { from: MODULE_NAME })
    // The record rules of `inbox:read` and `inbox:reply`: mailbox visibility, team leads and `hiddenBelow`.
    addPolicies(nuxt, { path: resolver.resolve('./runtime/server/policies') })
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const settings = options.settings ?? {}

    // --- Pages ------------------------------------------------------------------------------------------------------
    // Staff pages only, opt-in, and only with Admin (the user side of the inbox comes later).
    let adminPath: string | undefined
    let adminThreadPath: string | undefined
    let adminSettingsPath: string | undefined
    if (hasNuxtModule('@frigear-nu/admin')) {
      const { adminRoute } = await import('@frigear-nu/admin/utils')
      adminPath = resolvePagePath(settings.pages?.admin, adminRoute(nuxt, 'inbox'))
      adminThreadPath = resolvePagePath(settings.pages?.adminThread, adminRoute(nuxt, 'inbox', 'threads', ':id'))
      adminSettingsPath = resolvePagePath(settings.pages?.adminSettings, adminRoute(nuxt, 'inbox', 'settings'))
    }
    nuxt.options.runtimeConfig.public.inbox = {
      pages: { admin: adminPath, adminThread: adminThreadPath, adminSettings: adminSettingsPath },
    }

    // Server only. The empty strings are there so `NUXT_INBOX_EMAIL_WEBHOOK_SECRET`, `NUXT_INBOX_META_APP_SECRET` and
    // `NUXT_INBOX_META_VERIFY_TOKEN` override them at run time.
    const existing = (nuxt.options.runtimeConfig as { inbox?: Partial<InboxRuntimeConfig> }).inbox ?? {}
    const runtime: InboxRuntimeConfig = {
      retention: {
        days: options.retention?.days ?? existing.retention?.days ?? 365,
        mode: options.retention?.mode ?? existing.retention?.mode ?? 'delete',
        batch: options.retention?.batch ?? existing.retention?.batch ?? 500,
      },
      email: { webhookSecret: options.email?.webhookSecret ?? existing.email?.webhookSecret ?? '' },
      meta: {
        appSecret: options.meta?.appSecret ?? existing.meta?.appSecret ?? '',
        verifyToken: options.meta?.verifyToken ?? existing.meta?.verifyToken ?? '',
        apiBase: options.meta?.apiBase ?? existing.meta?.apiBase ?? 'https://graph.facebook.com',
        apiVersion: options.meta?.apiVersion ?? existing.meta?.apiVersion ?? 'v21.0',
        timeoutMs: options.meta?.timeoutMs ?? existing.meta?.timeoutMs ?? 10_000,
      },
      secrets: { ...existing.secrets, ...options.secrets },
      mailboxes: [...(existing.mailboxes ?? []), ...(options.mailboxes ?? [])],
    }
    nuxt.options.runtimeConfig.inbox = runtime

    // --- Channel registry -------------------------------------------------------------------------------------------
    // Built-in channels first, then every module's `extendInbox` (in module order), then the host's own option: a later
    // definition with the same id replaces an earlier one. Read once every module is done; an invalid one fails the build.
    let built: BuiltInboxRegistry | undefined
    const registryOf = (): BuiltInboxRegistry => {
      if (built) return built
      const stash = (nuxt.options as unknown as { inbox?: InboxInNuxt }).inbox?._extensions ?? []
      const { registry, issues } = buildInboxRegistry([
        builtInExtension(path => resolver.resolve(path)),
        ...stash,
        { channels: options.channels },
      ])
      if (issues.length) throw new Error(`[${MODULE_NAME}] Invalid inbox channels:\n- ${issues.join('\n- ')}`)
      built = registry
      return registry
    }
    nuxt.hook('modules:done', () => {
      registryOf()
    })
    defineVirtualRegistry(nuxt, {
      filename: 'inbox/registry.mjs',
      alias: '#inbox/registry',
      collect: registryOf,
      contents: registry => `export const channels = ${JSON.stringify(registry.channels)}\n`,
    })
    defineVirtualRegistry(nuxt, {
      filename: '#inbox/server-registry',
      target: 'server',
      collect: registryOf,
      contents: serverRegistryTemplate,
    })
    const types = JSON.stringify(resolver.resolve('./types'))
    addTypeTemplate({
      filename: 'types/inbox-registry.d.ts',
      getContents: () => `declare module '#inbox/registry' {
  import type { InboxChannelInfo } from ${types}
  export const channels: Record<string, InboxChannelInfo>
}
declare module '#inbox/server-registry' {
  import type { InboxChannelAdapter, InboxChannelInfo } from ${types}
  export const channels: Record<string, InboxChannelInfo>
  export const adapters: Record<string, InboxChannelAdapter>
}
`,
    }, { nitro: true, nuxt: true })

    // --- Database ---------------------------------------------------------------------------------------------------
    registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // --- API routes -------------------------------------------------------------------------------------------------
    addModuleRoutes(resolver, [
      { method: 'get', path: 'summary', file: 'admin/summary.get' },
      { method: 'get', path: 'mailboxes', file: 'admin/mailboxes.get' },
      { method: 'post', path: 'mailboxes', file: 'admin/mailboxes.post' },
      { method: 'get', path: 'mailboxes/:id', file: 'admin/mailbox.get' },
      { method: 'patch', path: 'mailboxes/:id', file: 'admin/mailbox.patch' },
      { method: 'delete', path: 'mailboxes/:id', file: 'admin/mailbox.delete' },
      { method: 'get', path: 'threads', file: 'admin/threads.get' },
      { method: 'get', path: 'threads/:id', file: 'admin/thread.get' },
      { method: 'patch', path: 'threads/:id', file: 'admin/thread.patch' },
      { method: 'post', path: 'threads/:id/messages', file: 'admin/thread-messages.post' },
      { method: 'post', path: 'threads/:id/notes', file: 'admin/thread-notes.post' },
      { method: 'post', path: 'threads/:id/hide', file: 'admin/thread-hide.post' },
      { method: 'get', path: 'channels', file: 'admin/channels.get' },
      { method: 'post', path: 'channels', file: 'admin/channels.post' },
      { method: 'patch', path: 'channels/:id', file: 'admin/channel.patch' },
      { method: 'delete', path: 'channels/:id', file: 'admin/channel.delete' },
      { method: 'get', path: 'audit', file: 'admin/audit.get' },
      { method: 'get', path: 'contacts/:id/export', file: 'admin/contact-export.get' },
      { method: 'post', path: 'contacts/:id/erase', file: 'admin/contact-erase.post' },
    ], { base: '/api/admin/inbox' })

    // Webhooks are registered at the providers, the documented exception to the `/api/<module>` rule.
    addModuleRoutes(resolver, [
      { method: 'post', path: 'email', file: 'webhooks/email.post' },
      { method: 'get', path: 'meta', file: 'webhooks/meta.get' },
      { method: 'post', path: 'meta', file: 'webhooks/meta.post' },
      { method: 'post', path: ':channel', file: 'webhooks/channel.post' },
    ], { base: '/api/inbox/webhooks' })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)
    // Creates the mailboxes of `inbox.mailboxes` on the first request.
    addServerPlugin(resolver.resolve('./runtime/server/plugins/seed'))

    // --- Soft integrations ------------------------------------------------------------------------------------------
    // The contact form: submissions of forms connected to a mailbox (a `form` channel account) become threads.
    if (hasNuxtModule('@frigear-nu/forms')) addServerPlugin(resolver.resolve('./runtime/server/plugins/forms'))
    // Team mailboxes: a team's leads read its mailbox (`isTeamLead` of teams).
    if (hasNuxtModule('@frigear-nu/teams')) addServerPlugin(resolver.resolve('./runtime/server/plugins/teams'))
    // The assignee hears about new messages on the channels they chose for `inbox.message`.
    if (hasNuxtModule('@frigear-nu/push')) {
      const { extendNotificationTopics } = await import('@frigear-nu/push/utils')
      extendNotificationTopics(nuxt, [{
        id: 'inbox.message',
        label: { da: 'Nye beskeder i indbakken', en: 'New inbox messages' },
        description: { da: 'Når nogen skriver i en tråd, du er tildelt.', en: 'When someone writes in a thread assigned to you.' },
        defaults: { email: false, sms: false, push: true },
        channels: ['email', 'push'],
      }])
      addServerPlugin(resolver.resolve('./runtime/server/plugins/push'))
    }

    // --- Retention --------------------------------------------------------------------------------------------------
    // The `inbox:retention` Nitro task, on `retention.cron` (nightly unless set; `false` registers it without a
    // schedule). Like the shifts reminders it merges into `scheduledTasks` and mirrors its cron into wrangler.
    const cron = options.retention?.cron === undefined ? '30 3 * * *' : options.retention.cron
    nuxt.hook('nitro:config', (nitroConfig) => {
      nitroConfig.experimental ||= {}
      nitroConfig.experimental.tasks = true
      nitroConfig.tasks ||= {}
      nitroConfig.tasks['inbox:retention'] = {
        handler: resolver.resolve('./runtime/server/tasks/retention'),
        description: 'Delete or anonymise closed inbox threads older than their mailbox keeps them.',
      }
      if (cron) {
        nitroConfig.scheduledTasks ||= {}
        const scheduled = nitroConfig.scheduledTasks[cron]
        nitroConfig.scheduledTasks[cron] = [...(Array.isArray(scheduled) ? scheduled : scheduled ? [scheduled] : []), 'inbox:retention']
      }
    })
    // nitropack 2 bundles `scheduledTasks` into the worker but never writes the cron expressions to wrangler.json, so
    // Cloudflare would never trigger them: mirror our cron into `triggers.crons` (a deduped union).
    if (cron) {
      nuxt.hook('nitro:init', (nitro) => {
        if (!nitro.options.preset.startsWith('cloudflare')) return
        const wrangler = ((nitro.options.cloudflare ||= {}).wrangler ||= {})
        wrangler.triggers = { ...wrangler.triggers, crons: [...new Set([...(wrangler.triggers?.crons ?? []), cron])] }
      })
    }

    // --- App runtime ------------------------------------------------------------------------------------------------
    addImports([
      { name: 'useInboxTranslate', from: resolver.resolve('./runtime/app/composables/useInboxTranslate') },
      { name: 'useInboxLinks', from: resolver.resolve('./runtime/app/composables/useInboxLinks') },
      { name: 'useInboxMailboxActions', from: resolver.resolve('./runtime/app/composables/useInboxMailboxActions') },
      { name: 'useInboxChannelActions', from: resolver.resolve('./runtime/app/composables/useInboxChannelActions') },
      { name: 'useInboxThreadActions', from: resolver.resolve('./runtime/app/composables/useInboxThreadActions') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })

    addModulePages(MODULE_NAME, resolver, [
      { name: 'inbox-admin', path: adminPath, file: './runtime/app/pages/admin.vue' },
      { name: 'inbox-admin-thread', path: adminThreadPath, file: './runtime/app/pages/admin-thread.vue' },
      { name: 'inbox-admin-settings', path: adminSettingsPath, file: './runtime/app/pages/admin-settings.vue' },
    ])

    const dashboard = settings.dashboard === undefined ? 'crew.home' : settings.dashboard
    if (dashboard && adminThreadPath && hasNuxtModule('@frigear-nu/dashboard')) await addDashboardItems(nuxt, dashboard, resolver.resolve)

    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'admin.nav' })
  },
})

/** "Unassigned" and "Assigned to me" for staff who answer the inbox; they render nothing for anyone without a mailbox. */
async function addDashboardItems(nuxt: Nuxt, name: string, resolve: (path: string) => string) {
  const { extendDashboard } = await import('@frigear-nu/dashboard/utils')
  extendDashboard(nuxt, name, [
    {
      id: 'inbox.unassigned',
      component: resolve('./runtime/app/dashboard/InboxUnassigned.vue'),
      title: 'Unassigned messages',
      titleKey: 'inbox.dashboard.unassigned',
      order: 70,
      platforms: ['web'],
      permission: inboxAccess.permissions.read,
    },
    {
      id: 'inbox.mine',
      component: resolve('./runtime/app/dashboard/InboxMine.vue'),
      title: 'Assigned to me',
      titleKey: 'inbox.dashboard.mine',
      order: 71,
      platforms: ['web'],
      permission: inboxAccess.permissions.read,
    },
  ])
}
