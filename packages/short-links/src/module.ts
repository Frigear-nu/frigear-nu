import {
  addComponentsDir,
  addImports,
  addServerHandler,
  addServerImportsDir,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  addModulePages,
  addModuleRoutes,
  addOptionalMenuSource,
  inlineModuleRuntime,
  registerDatabaseTable,
  registerLocales,
  registerModule,
  registerTailwindSource,
  resolvePagePath,
} from '@frigear-nu/module-kit/utils'
import { registerAccess } from '@frigear-nu/auth/utils'
import { shortLinksAccess } from './runtime/access'
import type { ModuleOptions, PublicModuleOptions, ShortLinkClickedContext, ShortLinksRuntimeConfig } from './types'

export type * from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    shortLinks?: ModuleOptions
  }

  interface RuntimeConfig {
    shortLinks: ShortLinksRuntimeConfig
  }

  interface PublicRuntimeConfig {
    shortLinks: PublicModuleOptions
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /**
     * A person followed a short link (HEAD requests and link scanners are not counted). The owner attributes the click
     * here: `ctx.link.owner` says whose link it is, `ctx.subject` is the opaque segment after the code (a campaign
     * delivery token, say). Runs before the redirect; a listener that throws is logged and the visitor still redirected.
     */
    'short-links:clicked': (ctx: ShortLinkClickedContext) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/short-links'
const DEFAULT_RETENTION_CRON = '15 4 * * *'

/** `/l`, `l/`, `/go//` -> `/l`, `/go`. */
function normalizePath(path: string | undefined): string {
  const trimmed = (path ?? '/l').trim().replace(/^\/+|\/+$/g, '')
  if (!trimmed || !/^[\w./-]+$/.test(trimmed)) throw new Error(`[${MODULE_NAME}] shortLinks.path must be a path such as "/l", got "${path}".`)
  return `/${trimmed}`
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'shortLinks' },
  defaults: {
    path: '/l',
    settings: { pages: {} },
  },
  moduleDependencies: {
    '@nuxthub/core': { version: '>=0.10' },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/auth': { version: '>=0.0.1' },
    '@frigear-nu/ui': { version: '>=0.0.1' },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
    // Provides the admin route and shell the admin page lives in; the page components come from `@frigear-nu/ui`.
    '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    // The `short-links:manage` permission (`runtime/access.ts`).
    registerAccess(nuxt, shortLinksAccess, { from: MODULE_NAME })
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))

    const path = normalizePath(options.path)
    const settings = options.settings ?? {}

    // The admin page is on by default with `@frigear-nu/admin` (`pages.admin: false` turns it off). Imported only when
    // Admin is installed: it is an optional module, and a host without it must still load this one.
    let adminPath: string | undefined
    if (hasNuxtModule('@frigear-nu/admin')) {
      const { adminRoute } = await import('@frigear-nu/admin/utils')
      adminPath = resolvePagePath(settings.pages?.admin ?? true, adminRoute(nuxt, 'short-links'))
    }

    const existing = nuxt.options.runtimeConfig.shortLinks as Partial<ShortLinksRuntimeConfig> | undefined
    nuxt.options.runtimeConfig.shortLinks = {
      path,
      // An empty string so `NUXT_SHORT_LINKS_BASE_URL` can set it at runtime.
      baseUrl: options.baseUrl ?? existing?.baseUrl ?? '',
      retention: { days: options.retention?.days ?? existing?.retention?.days ?? 365 },
    }
    nuxt.options.runtimeConfig.public.shortLinks = { path, pages: { admin: adminPath } }

    // --- Database -------------------------------------------------------------------------
    registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // --- Redirect ---------------------------------------------------------------------------
    // Public, outside `/api` on purpose: these URLs are what people see in emails and SMS. Every method reaches the
    // handler, which answers GET and HEAD and refuses the rest.
    for (const route of [`${path}/:code`, `${path}/:code/:subject`]) {
      addServerHandler({ route, handler: resolver.resolve('./runtime/server/routes/public/redirect') })
    }

    // --- Admin API --------------------------------------------------------------------------
    // The static segment `owners` wins over `:id` in h3's radix router, whatever the registration order.
    addModuleRoutes(resolver, [
      { method: 'get', path: '', file: 'admin/links.get' },
      { method: 'post', path: '', file: 'admin/links.post' },
      { method: 'get', path: 'owners', file: 'admin/owners.get' },
      { method: 'patch', path: ':id', file: 'admin/link.patch' },
      { method: 'post', path: ':id/disable', file: 'admin/link-disable.post' },
      { method: 'post', path: ':id/enable', file: 'admin/link-enable.post' },
    ], { base: '/api/admin/short-links' })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)

    // --- Retention --------------------------------------------------------------------------
    // The `short-links:retention` Nitro task deletes old click rows, on `retention.cron` (nightly unless set; `false`
    // registers it without a schedule). Not registered when `retention.days` is `false` (keep the rows forever).
    const retentionDays = nuxt.options.runtimeConfig.shortLinks.retention.days
    const cron = retentionDays === false
      ? false
      : options.retention?.cron === undefined ? DEFAULT_RETENTION_CRON : options.retention.cron
    if (retentionDays !== false) {
      nuxt.hook('nitro:config', (nitroConfig) => {
        nitroConfig.experimental ||= {}
        nitroConfig.experimental.tasks = true
        nitroConfig.tasks ||= {}
        nitroConfig.tasks['short-links:retention'] = {
          handler: resolver.resolve('./runtime/server/tasks/retention'),
          description: 'Delete short link click rows older than the retention period.',
        }
        if (cron) {
          nitroConfig.scheduledTasks ||= {}
          const scheduled = nitroConfig.scheduledTasks[cron]
          nitroConfig.scheduledTasks[cron] = [...(Array.isArray(scheduled) ? scheduled : scheduled ? [scheduled] : []), 'short-links:retention']
        }
      })
    }
    // nitropack 2 bundles `scheduledTasks` into the worker but never writes the cron expressions to wrangler.json, so
    // Cloudflare would never trigger them: mirror our cron into `triggers.crons` (a deduped union).
    if (cron) {
      nuxt.hook('nitro:init', (nitro) => {
        if (!nitro.options.preset.startsWith('cloudflare')) return
        const wrangler = ((nitro.options.cloudflare ||= {}).wrangler ||= {})
        wrangler.triggers = { ...wrangler.triggers, crons: [...new Set([...(wrangler.triggers?.crons ?? []), cron])] }
      })
    }

    // --- App runtime ------------------------------------------------------------------------
    addImports([
      { name: 'useShortLinkActions', from: resolver.resolve('./runtime/app/composables/useShortLinkActions') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })

    addModulePages(MODULE_NAME, resolver, [
      { name: 'short-links-admin', path: adminPath, file: './runtime/app/pages/admin.vue' },
    ])

    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'admin.nav' })
  },
})
