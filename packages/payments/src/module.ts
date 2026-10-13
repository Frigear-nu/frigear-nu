import {
  addImports,
  addServerHandler,
  addServerImportsDir,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import {
  moduleApiUrl,
  registerDatabaseTable,
  registerLocales,
  registerModule,
  registerTailwindSource,
} from '@frigear-nu/module-kit/utils'
import { addAuthScope } from '@frigear-nu/auth/utils'
import { extendUsersAdmin } from '@frigear-nu/users/utils'
import { registerStripeEventHandler } from '@frigear-nu/stripe/utils'
import type {
  CheckoutBeforeContext,
  ModuleOptions,
  PaymentHookContext,
  PaymentsRuntimeConfig,
} from './types'

export type {
  CheckoutBeforeContext,
  CreatePaymentInput,
  CreatePaymentResult,
  ModuleOptions,
  PaymentDto,
  PaymentHookContext,
  PaymentItem,
  PaymentReference,
  PaymentStatus,
  PaymentsRuntimeConfig,
  ResumeResponse,
} from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    payments?: ModuleOptions
  }

  interface RuntimeConfig {
    payments: PaymentsRuntimeConfig
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** Policy hook: throw to deny a checkout, or adjust `ctx.params` before it reaches Stripe. */
    'payments:checkout:before': (ctx: CheckoutBeforeContext) => void | Promise<void>
    /** A payment became `paid` (fired once, from the verified Stripe event). */
    'payments:paid': (ctx: PaymentHookContext) => void | Promise<void>
    /** An asynchronous payment method failed. */
    'payments:failed': (ctx: PaymentHookContext) => void | Promise<void>
    /** The Checkout session expired without payment. */
    'payments:expired': (ctx: PaymentHookContext) => void | Promise<void>
    /** The payment was (partially) refunded; inspect `payment.status` / `payment.refundedAmount`. */
    'payments:refunded': (ctx: PaymentHookContext) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/payments'

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'payments' },
  defaults: {
    settings: { checkoutExpiresInMinutes: 30 },
  },
  moduleDependencies: {
    '@nuxthub/core': {
      version: '>=0.10',
      defaults: { kv: true },
    },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/auth': { version: '>=0.0.1' },
    '@frigear-nu/users': { version: '>=0.0.1' },
    '@frigear-nu/stripe': { version: '>=0.0.1' },
    '@frigear-nu/widget': { version: '>=0.0.0', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    addAuthScope(nuxt,
      { name: 'payments:read', description: 'Read your payments' },
      { name: 'payments:write', description: 'Resume your payments' },
    )
    const resolver = createResolver(import.meta.url)
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))

    nuxt.options.runtimeConfig.payments = {
      checkoutExpiresInMinutes: options.settings?.checkoutExpiresInMinutes ?? 30,
    }

    // --- Database -------------------------------------------------------------------------
    await registerDatabaseTable(nuxt, {
      name: 'payments',
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // --- Stripe events --------------------------------------------------------------------
    // No webhook route of our own: @frigear-nu/stripe verifies, dedupes and dispatches events.
    registerStripeEventHandler(nuxt, {
      events: [
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.async_payment_failed',
        'checkout.session.expired',
        'charge.refunded',
      ],
      handler: resolver.resolve('./runtime/server/stripe/payment-events'),
    })

    // --- API routes -----------------------------------------------------------------------
    addServerHandler({
      route: moduleApiUrl('payments'),
      method: 'get',
      handler: resolver.resolve('./runtime/server/routes/payments/index.get'),
    })
    addServerHandler({
      route: moduleApiUrl('payments', 'resume'),
      method: 'post',
      handler: resolver.resolve('./runtime/server/routes/payments/resume.post'),
    })

    // Staff view of a user's payments plus a "Payments" tab and a "Last payment" card on the admin user page of
    // `@frigear-nu/users`, authorized through its admin policy (`users:admin:authorize`, `view`).
    await extendUsersAdmin(nuxt, {
      routes: [{ method: 'get', path: 'payments', handler: resolver.resolve('./runtime/server/routes/admin/user-payments.get') }],
      tab: {
        id: 'payments',
        component: resolver.resolve('./runtime/app/tabs/Payments.vue'),
        order: 20,
        label: 'Payments',
        labelKey: 'payments.admin.tab',
        icon: 'i-lucide-credit-card',
      },
      widget: {
        id: 'payments-last',
        component: resolver.resolve('./runtime/app/widgets/AdminLastPayment.vue'),
        order: 20,
        span: 2,
      },
    })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))

    addImports([
      { name: 'usePayments', from: resolver.resolve('./runtime/app/composables/usePayments') },
    ])
  },
})
