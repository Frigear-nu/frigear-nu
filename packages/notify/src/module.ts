import { addServerImportsDir, addServerTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'
import type { ModuleOptions } from './types'

export type { ModuleOptions, EmailNotification, EmailDriver } from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    notify?: ModuleOptions
  }
  interface NuxtOptions {
    notify?: ModuleOptions
  }
}

// Name -> built-in driver implementation (path relative to this file + its export name).
const BUILTIN_EMAIL_DRIVERS: Record<string, { path: string, exportName: string }> = {
  log: { path: './runtime/drivers/log', exportName: 'logEmailDriver' },
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/notify', configKey: 'notify' },
  defaults: {
    email: { driver: 'log' },
  },
  async setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const driverSetting = options.email?.driver ?? 'log'

    // Resolves the configured email driver into a virtual module any server code - in this
    // module or any consumer, e.g. `@frigear-nu/users` - can import to actually deliver an
    // `EmailNotification`. Picking the driver is done here, once, for the whole app, rather than
    // per notification type: it's a deployment concern for the app/consuming layer, not something
    // individual feature modules should each have their own setting for.
    addServerTemplate({
      filename: '#notify/email-driver',
      getContents: async () => {
        const builtin = BUILTIN_EMAIL_DRIVERS[driverSetting]
        if (builtin) {
          return `export { ${builtin.exportName} as default } from ${JSON.stringify(resolver.resolve(builtin.path))}`
        }
        const driverPath = await resolver.resolvePath(driverSetting, { cwd: nuxt.options.rootDir })
        return `export { default } from ${JSON.stringify(driverPath)}`
      },
    })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
  },
})
