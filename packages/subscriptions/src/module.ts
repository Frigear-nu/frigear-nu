import {
  addComponentsDir,
  addImports,
  addRouteMiddleware,
  addServerHandler,
  addServerImportsDir,
  createResolver,
  defineNuxtModule,
  extendPages,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  defineModulePage,
  moduleApiUrl,
  registerDatabaseTable,
  registerModule,
  registerLocales,
  registerTailwindSource,
} from '@frigear-nu/module-kit/utils'
import { addAuthScope } from '@frigear-nu/auth/utils'
import { addMcpDefinitions } from '@frigear-nu/mcp/utils'
import { registerStripeEventHandler } from '@frigear-nu/stripe/utils'
import type {
  CheckoutBeforeContext,
  ModuleOptions,
  PlansFilterContext,
  PublicModuleOptions,
  SubscriptionsRuntimeConfig,
} from './types'

export type {
  AdminMembershipResponse,
  AdminPaymentLinkResponse,
  CheckoutBeforeContext,
  CheckoutBody,
  CheckoutResponse,
  MeResponse,
  ModuleOptions,
  PlanAvailability,
  PlanConfig,
  PlanDisabledRange,
  PlanPrice,
  PlanPriceRef,
  PlansFilterContext,
  PlansResponse,
  PortalBody,
  PublicModuleOptions,
  PublicPlan,
  ResolvedPlan,
  SubscriptionDto,
  SubscriptionsRuntimeConfig,
} from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    subscriptions?: ModuleOptions
  }

  interface RuntimeConfig {
    subscriptions: SubscriptionsRuntimeConfig
  }

  interface PublicRuntimeConfig {
    subscriptions: PublicModuleOptions
  }
}

declare module '#app' {
  interface PageMeta {
    subscription?: { plans?: string[], redirectTo?: string }
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** Policy hook: throw to deny a checkout / plan change, or adjust `ctx.params`. */
    'subscriptions:checkout:before': (ctx: CheckoutBeforeContext) => void | Promise<void>
    /** Policy hook: hide or reorder plans by changing `ctx.plans` in place. */
    'subscriptions:plans:filter': (ctx: PlansFilterContext) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/subscriptions'

function resolvePagePath(setting: string | boolean | undefined, defaultPath: string) {
  if (typeof setting === 'string') return setting
  if (setting === true) return defaultPath
  return undefined
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'subscriptions' },
  defaults: {
    plans: {},
    settings: { pages: {}, allowChangeInPortal: false },
  },
  moduleDependencies: {
    '@nuxthub/core': {
      version: '>=0.10',
      defaults: { kv: true },
    },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/auth': { version: '>=0.0.1' },
    '@frigear-nu/mcp': { version: '>=0.0.1' },
    '@frigear-nu/users': { version: '>=0.0.1' },
    '@frigear-nu/stripe': { version: '>=0.0.1' },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    addAuthScope(nuxt,
      { name: 'subscriptions:read', description: 'Read your subscription and plans' },
      { name: 'subscriptions:write', description: 'Start a subscription checkout' },
    )
    const resolver = createResolver(import.meta.url)
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))

    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const settings = options.settings ?? {}
    const plans = options.plans ?? {}
    const withMenus = hasNuxtModule('@frigear-nu/menu')

    if (!nuxt.options.hub?.kv) {
      throw new Error('[@frigear-nu/subscriptions] NuxtHub KV is required (plans cache). Set `hub: { kv: true }` in your Nuxt config.')
    }

    const membershipPath = resolvePagePath(settings.pages?.membership, '/account/membership')
    const successPath = resolvePagePath(settings.pages?.success, '/account/membership/success')
    const cancelPath = resolvePagePath(settings.pages?.cancel, '/account/membership/cancel')

    const planEntries = Object.entries(plans)
    nuxt.options.runtimeConfig.subscriptions = {
      plans: Object.fromEntries(planEntries.map(([key, plan]) => [key, {
        prices: plan.prices,
        label: plan.label,
        description: plan.description,
        rank: plan.rank,
        features: plan.features,
        availability: plan.availability,
      }])),
    }
    nuxt.options.runtimeConfig.public.subscriptions = {
      pages: { membership: membershipPath, success: successPath, cancel: cancelPath },
      plans: planEntries
        .map(([key, plan]) => ({ key, label: plan.label ?? key, description: plan.description, rank: plan.rank, features: plan.features }))
        .sort((a, b) => a.rank - b.rank),
      allowChangeInPortal: settings.allowChangeInPortal === true,
    }

    // --- Database -------------------------------------------------------------------------
    await registerDatabaseTable(nuxt, {
      name: 'subscriptions',
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // --- Stripe webhook handlers ----------------------------------------------------------
    registerStripeEventHandler(nuxt, {
      events: [
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'customer.subscription.paused',
        'customer.subscription.resumed',
      ],
      handler: resolver.resolve('./runtime/server/stripe/subscription-events'),
    })

    // --- API routes -----------------------------------------------------------------------
    addServerHandler({
      route: moduleApiUrl('subscriptions', 'plans'),
      method: 'get',
      handler: resolver.resolve('./runtime/server/routes/subscriptions/plans.get'),
    })
    addServerHandler({
      route: moduleApiUrl('subscriptions', 'me'),
      method: 'get',
      handler: resolver.resolve('./runtime/server/routes/subscriptions/me.get'),
    })
    addServerHandler({
      route: moduleApiUrl('subscriptions', 'checkout'),
      method: 'post',
      handler: resolver.resolve('./runtime/server/routes/subscriptions/checkout.post'),
    })
    addServerHandler({
      route: moduleApiUrl('subscriptions', 'portal'),
      method: 'post',
      handler: resolver.resolve('./runtime/server/routes/subscriptions/portal.post'),
    })

    // Staff membership management (grant free / payment link / revoke), authorized through the users admin
    // policy (`users:admin:authorize`, action `update`). Used by the `UsersAdminMembership` component.
    for (const [method, path, file] of [
      ['get', 'subscription', 'subscription.get'],
      ['post', 'subscription', 'subscription.post'],
      ['delete', 'subscription', 'subscription.delete'],
      ['post', 'subscription/payment-link', 'payment-link.post'],
    ] as const) {
      addServerHandler({
        route: `/api/admin/users/:id/${path}`,
        method,
        handler: resolver.resolve(`./runtime/server/routes/admin/${file}`),
      })
    }

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    addMcpDefinitions(nuxt, resolver.resolve('./runtime/server/mcp'))

    // --- App runtime (owned by the UI side of the package) ---------------------------------
    addImports([
      { name: 'usePlans', from: resolver.resolve('./runtime/app/composables/usePlans') },
      { name: 'useSubscription', from: resolver.resolve('./runtime/app/composables/useSubscription') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })
    addRouteMiddleware({
      name: 'subscription',
      path: resolver.resolve('./runtime/app/middleware/subscription'),
    })

    // Pages are opt-in (they require `@nuxt/ui` in the consuming app).
    if (membershipPath || successPath || cancelPath) {
      extendPages((pages) => {
        const existingPaths = new Set(pages.map(page => page.path))

        if (membershipPath && !existingPaths.has(membershipPath)) {
          pages.push(defineModulePage(MODULE_NAME, { name: 'subscriptions-membership', path: membershipPath, file: resolver.resolve('./runtime/app/pages/membership.vue') }))
        }
        if (successPath && !existingPaths.has(successPath)) {
          pages.push(defineModulePage(MODULE_NAME, { name: 'subscriptions-success', path: successPath, file: resolver.resolve('./runtime/app/pages/success.vue') }))
        }
        if (cancelPath && !existingPaths.has(cancelPath)) {
          pages.push(defineModulePage(MODULE_NAME, { name: 'subscriptions-cancel', path: cancelPath, file: resolver.resolve('./runtime/app/pages/cancel.vue') }))
        }
      })
    }

    if (withMenus) {
      const { registerMenuSource } = await import('@frigear-nu/menu/utils')
      registerMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'dashboard.account' })
    }
  },
})
