import {
  addServerImports,
  addServerImportsDir,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
} from '@nuxt/kit'
import type Stripe from 'stripe'
import { addModuleRoutes, defineVirtualRegistry, registerModule, extendDatabaseTable, inlineModuleRuntime } from '@frigear-nu/module-kit/utils'
import type { ModuleOptions, RegisteredStripeEventHandler, StripeEventHandlerContext, StripePublicRuntimeConfig, StripeRuntimeConfig } from './types'

export type {
  ModuleOptions,
  StripeEventType,
  StripeEventOf,
  StripeEventHandler,
  StripeEventHandlerContext,
  RegisteredStripeEventHandler,
  StripeRuntimeConfig,
  StripePublicRuntimeConfig,
} from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    stripe?: ModuleOptions
  }

  interface NuxtOptions {
    stripe?: ModuleOptions & {
      _handlers?: RegisteredStripeEventHandler[]
    }
  }

  interface RuntimeConfig {
    stripe: StripeRuntimeConfig
  }

  interface PublicRuntimeConfig {
    stripe: StripePublicRuntimeConfig
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** Fired for every verified, not-yet-processed Stripe webhook event, once handlers have been dispatched. */
    'stripe:event': (event: Stripe.Event, ctx: StripeEventHandlerContext) => void | Promise<void>
  }
}

/** The Stripe API version this package is written against (matches the pinned `stripe` SDK). */
export const STRIPE_API_VERSION = '2026-09-30.endive'

export const DEFAULT_WEBHOOK_PATH = '/api/stripe/webhook'

const DEFAULT_HANDLER_ORDER = 100

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/stripe', configKey: 'stripe' },
  defaults: {
    settings: { webhookPath: DEFAULT_WEBHOOK_PATH },
  },
  moduleDependencies: {
    '@nuxthub/core': {
      version: '>=0.10',
      // The webhook stores processed event ids in NuxtHub KV.
      defaults: { kv: true },
    },
    '@frigear-nu/module-kit': {
      version: '>=0.0.1',
    },
    '@frigear-nu/users': {
      version: '>=0.0.1',
    },
  },
  async setup(options, nuxt) {
    registerModule('@frigear-nu/stripe', nuxt)
    const resolver = createResolver(import.meta.url)
    const configuredPath = options.settings?.webhookPath || DEFAULT_WEBHOOK_PATH
    const webhookPath = configuredPath.startsWith('/') ? configuredPath : `/${configuredPath}`

    if (!nuxt.options.hub?.kv) {
      throw new Error('[@frigear-nu/stripe] NuxtHub KV is required for webhook idempotency. Set `hub: { kv: true }` in your Nuxt config.')
    }

    const runtimeConfig = nuxt.options.runtimeConfig
    runtimeConfig.stripe = {
      secretKey: '',
      webhookSecret: '',
      apiVersion: STRIPE_API_VERSION,
      ...runtimeConfig.stripe,
    }
    runtimeConfig.public.stripe = {
      publishableKey: '',
      ...runtimeConfig.public.stripe,
    }

    // `webhookPath` is registered at a Stripe endpoint, so it is configurable and ignores the `/api/stripe` base.
    addModuleRoutes(resolver, [{ method: 'post', path: webhookPath, file: 'webhook.post' }], { base: '/api/stripe' })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)
    addServerImports([
      { name: 'onStripeEvent', from: resolver.resolve('./runtime/utils/registry') },
      { name: 'defineStripeEventHandler', from: resolver.resolve('./runtime/utils/handlers') },
    ])

    addTypeTemplate({
      filename: 'types/stripe-handlers.d.ts',
      getContents: () => `declare module '#stripe/handlers' {
  import type { StripeEventHandler } from ${JSON.stringify(resolver.resolve('./types'))}
  export const handlers: Array<{ events: string[] | '*', order?: number, handler: StripeEventHandler }>
}
`,
    })

    // Modules (and host apps) subscribe through `registerStripeEventHandler` during their own
    // `setup()`, in any order. Once every module is done, bundle all registered handler files into
    // one virtual module that the webhook route imports - no runtime scanning, Workers friendly.
    defineVirtualRegistry(nuxt, {
      filename: '#stripe/handlers',
      target: 'server',
      collect: () => (Array.isArray(nuxt.options.stripe?._handlers) ? nuxt.options.stripe._handlers : []),
      contents: registered => `
${registered.map((entry, index) => `import handler${index} from ${JSON.stringify(entry.handler)}`).join('\n')}
export const handlers = [${registered.map((entry, index) =>
  `{ events: ${JSON.stringify(entry.events)}, order: ${entry.order ?? DEFAULT_HANDLER_ORDER}, handler: handler${index} }`,
).join(', ')}]
`,
    })

    extendDatabaseTable(nuxt, {
      resolver,
      file: dialect => `./runtime/server/db/schema.${dialect}`,
    })
  },
})
