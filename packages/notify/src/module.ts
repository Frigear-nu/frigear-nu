import {
  addImports,
  addServerImportsDir,
  addServerTemplate,
  addTemplate,
  addTypeTemplate,
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
}

const BUILTIN_UI_DRIVERS: Record<string, { path: string, exportName: string }> = {
  'log': { path: './runtime/drivers/log', exportName: 'logDriver' },
  '@nuxt/ui': { path: './runtime/drivers/ui/nuxt.ui', exportName: 'default' },
}

// Name -> built-in driver implementation (path relative to this file + its export name). Shared
// by every server-side notification type (email, sms, simple) since `log` means the same thing
// for all of them: log the notification instead of sending it.
const BUILTIN_SERVER_DRIVERS: Record<string, { path: string, exportName: string }> = {
  log: { path: './runtime/drivers/log', exportName: 'logDriver' },
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@frigear-nu/notify', configKey: 'notify' },
  defaults: {
    email: { driver: 'log' },
    sms: { driver: 'log' },
    simple: { driver: 'log' },
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
    // Only ever set up (and its files only ever written/loaded) when explicitly configured -
    // unlike email/sms/simple, there's no sensible default UI to push notifications to.
    if (options.ui?.driver) {
      if (options.ui.driver === '@nuxt/ui' && !hasNuxtModule('@nuxt/ui')) {
        throw new Error(`@nuxt/ui driver is configured but @nuxt/ui module is not installed. Please install @nuxt/ui or configure a different UI driver.`)
      }
      addImports({
        name: 'useNotify',
        as: 'useNotify',
        from: resolver.resolve('./runtime/app/composables/useNotify'),
      })
      // `defineUINotification` is a plain, framework-agnostic typing helper (no server-only code),
      // so it's also made available client-side for building the `UINotification`s passed to
      // `useNotify().addNotification`.
      addImports({
        name: 'defineUINotification',
        as: 'defineUINotification',
        from: resolver.resolve('./runtime/server/utils/definers'),
      })
      const uiDriverTemplate = addTemplate({
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
      // `addTemplate` alone only writes the file into the build dir - app code needs an explicit
      // alias so bundlers (Vite/webpack) can resolve the `#notify/ui-driver` specifier used in
      // `useNotify` to the generated file.
      nuxt.options.alias['#notify/ui-driver'] = uiDriverTemplate.dst
      // ...and an ambient module declaration so consuming app code type-checks against it too.
      addTypeTemplate({
        filename: 'types/notify-ui-driver.d.ts',
        getContents: () => `declare module '#notify/ui-driver' {
  import type { UIDriver } from ${JSON.stringify(resolver.resolve('./types'))}
  const driver: UIDriver
  export default driver
}
`,
      })
    }

    // Email/SMS/Simple Drivers
    // Resolves each configured driver into its own virtual module any server code - in this
    // module or any consumer, e.g. `@frigear-nu/users` - can import to actually deliver that kind
    // of notification. Picking the driver is done here, once, for the whole app, rather than per
    // notification type: it's a deployment concern for the app/consuming layer, not something
    // individual feature modules should each have their own setting for. Only the configured
    // driver's file is ever resolved/loaded - never every built-in driver up front.
    const registerServerDriver = (name: string, driverType: string, driver: string) => {
      const filename = `#notify/${name}.ts`
      addServerTemplate({
        filename,
        getContents: async () => {
          const builtin = BUILTIN_SERVER_DRIVERS[driver]
          if (builtin) {
            return `export { ${builtin.exportName} as default } from ${JSON.stringify(await resolver.resolvePath(builtin.path))}`
          }
          const driverPath = await resolver.resolvePath(driver, { cwd: nuxt.options.rootDir })
          return `export { default } from ${JSON.stringify(driverPath)}`
        },
      })
      // `addServerTemplate` registers the virtual module for Nitro's build, but not its type -
      // declare it so server code (in this module or consumers) type-checks against it. Needs
      // both contexts: `nitro:true` so `server/` code resolves it, and `nuxt:true` because the
      // app-level program also type-checks `nitro-imports.d.ts`'s re-export of this module's
      // auto-imported server utils (e.g. `dispatchEmailNotification`), which in turn resolves
      // this file's own imports.
      addTypeTemplate({
        filename: `types/notify-${name}.d.ts`,
        getContents: () => `declare module '#notify/${name}' {
  import type { ${driverType} } from ${JSON.stringify(resolver.resolve('./types'))}
  const driver: ${driverType}
  export default driver
}
`,
      }, { nitro: true, nuxt: true })
    }

    registerServerDriver('email-driver', 'EmailDriver', options.email?.driver ?? 'log')
    registerServerDriver('sms-driver', 'SMSDriver', options.sms?.driver ?? 'log')
    registerServerDriver('simple-driver', 'SimpleDriver', options.simple?.driver ?? 'log')

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
  },
})
