import {
  addComponentsDir,
  addImports,
  addPlugin,
  addRouteMiddleware,
  addServerHandler,
  addServerImportsDir,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import {
  moduleApiUrl,
  registerDatabaseTable,
  registerModule,
  registerLocales,
  registerTailwindSource,
  resolvePagePath,
  addModulePages,
  addOptionalMenuSource,
  inlineModuleRuntime,
} from '@frigear-nu/module-kit/utils'
import { addAuthScope } from '@frigear-nu/auth/utils'
import { extendUsersAdmin } from '@frigear-nu/users/utils'
import { addMcpDefinitions } from '@frigear-nu/mcp/utils'
import { registerStripeEventHandler } from '@frigear-nu/stripe/utils'
import type {
  CheckoutBeforeContext,
  InvoicePaymentEvent,
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
  InvoicePaymentEvent,
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
    /** A membership invoice was paid, failed or voided. Only fired when `@frigear-nu/payments` is installed, which stores it. */
    'subscriptions:invoice': (ctx: { invoice: InvoicePaymentEvent }) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/subscriptions'

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
    // Membership invoices are only announced (and stored as payments) when it is installed.
    '@frigear-nu/payments': { version: '>=0.0.0', optional: true },
    '@frigear-nu/widget': { version: '>=0.0.0', optional: true },
    // The admin user tab and card are built from its components, so they are only added with it.
    '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
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
    registerDatabaseTable(nuxt, {
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

    // Membership charges show up as payments only when `@frigear-nu/payments` is installed; otherwise nothing changes.
    if (hasNuxtModule('@frigear-nu/payments', nuxt)) {
      registerStripeEventHandler(nuxt, {
        events: ['invoice.paid', 'invoice.payment_failed', 'invoice.voided', 'invoice.marked_uncollectible'],
        handler: resolver.resolve('./runtime/server/stripe/invoice-events'),
      })
    }

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

    // Staff membership management (grant free / payment link / revoke) plus a "Subscription" tab and a summary card on
    // the admin user page of `@frigear-nu/users`, authorized through its admin policy (`users:admin:authorize`,
    // `view` for reads, `update` for changes). Used by the `UsersAdminMembership` component.
    await extendUsersAdmin(nuxt, {
      routes: ([
        ['get', 'subscription', 'subscription.get'],
        ['get', 'subscriptions', 'subscriptions.get'],
        ['post', 'subscription', 'subscription.post'],
        ['delete', 'subscription', 'subscription.delete'],
        ['post', 'subscription/payment-link', 'payment-link.post'],
      ] as const).map(([method, path, file]) => ({ method, path, handler: resolver.resolve(`./runtime/server/routes/admin/${file}`) })),
      tab: {
        id: 'subscription',
        component: resolver.resolve('./runtime/app/tabs/Membership.vue'),
        order: 10,
        label: 'Subscription',
        labelKey: 'subscriptions.admin.tab',
        icon: 'i-lucide-badge-check',
      },
      widget: {
        id: 'subscriptions-current',
        component: resolver.resolve('./runtime/app/widgets/AdminCurrentSubscription.vue'),
        order: 10,
        span: 2,
      },
    })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)
    if (settings.mcp === true) addMcpDefinitions(nuxt, resolver.resolve('./runtime/server/mcp'))

    // --- App runtime (owned by the UI side of the package) ---------------------------------
    addImports([
      { name: 'usePlans', from: resolver.resolve('./runtime/app/composables/usePlans') },
      { name: 'useSubscription', from: resolver.resolve('./runtime/app/composables/useSubscription') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })
    addPlugin({ src: resolver.resolve('./runtime/app/plugins/warm-plans.client'), mode: 'client' })
    addRouteMiddleware({
      name: 'subscription',
      path: resolver.resolve('./runtime/app/middleware/subscription'),
    })

    // Pages are opt-in (they require `@nuxt/ui` in the consuming app).
    addModulePages(MODULE_NAME, resolver, [
      { name: 'subscriptions-membership', path: membershipPath, file: './runtime/app/pages/membership.vue' },
      { name: 'subscriptions-success', path: successPath, file: './runtime/app/pages/success.vue' },
      { name: 'subscriptions-cancel', path: cancelPath, file: './runtime/app/pages/cancel.vue' },
    ])

    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'dashboard.account' })
  },
})
