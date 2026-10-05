import {
  addImports,
  addServerImportsDir,
  addServerTemplate,
  addTemplate,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import type { ModuleOptions } from './types'

export type {
  ModuleOptions,
  SimpleNotification,
  UINotification,
  SMSNotification,
  EmailNotification,
  SimpleDriver,
  UIDriver,
  SMSDriver,
  EmailDriver,
} from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    notify?: ModuleOptions
  }

  interface NuxtOptions {
    notify?: ModuleOptions
  }
}

const BUILTIN_UI_DRIVERS: Record<string, { path: string, exportName: string }> = {
  'log': { path: './runtime/drivers/log', exportName: 'logDriver' },
  '@nuxt/ui': { path: './runtime/drivers/ui/nuxt.ui', exportName: 'default' },
}

// Name -> built-in driver implementation (path relative to this file + its export name).
const BUILTIN_EMAIL_DRIVERS: Record<string, { path: string, exportName: string }> = {
  log: { path: './runtime/drivers/log', exportName: 'logDriver' },
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/notify', configKey: 'notify' },
  defaults: {
    email: { driver: 'log' },
  },
  moduleDependencies: {
    '@nuxt/ui': {
      optional: true,
      version: '>=4.10',
    },
  },
  async setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)

    // UI Driver
    if (options.ui?.driver) {
      if (options.ui.driver === '@nuxt/ui' && !hasNuxtModule('@nuxt/ui')) {
        throw new Error(`@nuxt/ui driver is configured but @nuxt/ui module is not installed. Please install @nuxt/ui or configure a different UI driver.`)
      }
      addImports({
        name: 'useNotify',
        as: 'useNotify',
        from: resolver.resolve('./runtime/app/composables/useNotify'),
      })
      addTemplate({
        filename: '#notify/ui-driver.ts',
        write: true,
        getContents: async () => {
          const builtin = BUILTIN_UI_DRIVERS[options.ui?.driver as keyof typeof BUILTIN_UI_DRIVERS]
          if (builtin) {
            return `export { ${builtin.exportName} as default } from ${JSON.stringify(await resolver.resolvePath(builtin.path))}`
          }

          if (!options.ui?.driver) {
            throw new Error(`Invalid UI driver: ${options.ui?.driver || 'undefined'}`)
          }

          const driverPath = await resolver.resolvePath(options.ui.driver, { cwd: nuxt.options.rootDir })
          return `export { default } from ${JSON.stringify(driverPath)}`
        },
      })
    }

    // Email Driver
    // Resolves the configured email driver into a virtual module any server code - in this
    // module or any consumer, e.g. `@frigear-nu/users` - can import to actually deliver an
    // `EmailNotification`. Picking the driver is done here, once, for the whole app, rather than
    // per notification type: it's a deployment concern for the app/consuming layer, not something
    // individual feature modules should each have their own setting for.
    const emailDriver = options.email?.driver ?? 'log'
    addServerTemplate({
      filename: '#notify/email-driver.ts',
      getContents: async () => {
        const builtin = BUILTIN_EMAIL_DRIVERS[emailDriver]
        if (builtin) {
          return `export { ${builtin.exportName} as default } from ${JSON.stringify(await resolver.resolvePath(builtin.path))}`
        }
        const driverPath = await resolver.resolvePath(emailDriver, { cwd: nuxt.options.rootDir })
        return `export { default } from ${JSON.stringify(driverPath)}`
      },
    })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
  },
})
