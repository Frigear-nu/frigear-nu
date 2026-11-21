import {
  addImports,
  addPlugin,
  addServerImportsDir,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
  useLogger,
} from '@nuxt/kit'
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
import { resolveAuthMode } from '@frigear-nu/auth/mode'
import { extendUsersAdmin } from '@frigear-nu/users/utils'
import type {} from './schema'
import { pushAccess } from './runtime/access'
import { detectNativePushPlugin, isPackageInstalled, nativeLoaderTemplate, pushModuleDependencies, topicsTemplate } from './build'
import type { ModuleOptions, NotificationTopic, PushDeviceRegisteredContext, PushPublicConfig, PushRuntimeConfig } from './types'

export type {
  ChannelMatrixDto,
  ChannelMatrixInput,
  ChannelMatrixRow,
  ChannelSettings,
  ModuleOptions,
  NotificationChannel,
  NotificationTopic,
  NotificationTopicDto,
  NotifyUserInput,
  NotifyUserResult,
  PushDeviceDto,
  PushDeviceRegisteredContext,
  PushMessage,
  PushPlatform,
  PushProvider,
  PushPublicConfig,
  PushRuntimeConfig,
  RegisterDeviceInput,
  SendPushResult,
  Translated,
} from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    push?: ModuleOptions
  }

  interface RuntimeConfig {
    push: PushRuntimeConfig
  }

  interface PublicRuntimeConfig {
    push: PushPublicConfig
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** A device registered (or registered again: a moved token, a token seen at startup). Fired after it is stored. */
    'push:device:registered': (ctx: PushDeviceRegisteredContext) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/push'
const logger = useLogger(MODULE_NAME)

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'push' },
  defaults: {
    settings: { pages: {}, autoRegister: true },
  },
  // The mode is the app's own `authentication.mode` (`resolveAuthMode`). Client mode (a mobile app without a server)
  // is only the device side: no tables, routes or pages, and none of the server modules.
  moduleDependencies: pushModuleDependencies,
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    const mode = resolveAuthMode(nuxt)
    const server = mode === 'server'
    const settings = options.settings ?? {}

    const notificationsPath = server ? resolvePagePath(settings.pages?.notifications ?? true, '/account/notifications') : undefined
    nuxt.options.runtimeConfig.public.push = {
      mode,
      pages: { notifications: notificationsPath },
      autoRegister: settings.autoRegister !== false,
    }
    inlineModuleRuntime(nuxt, resolver)

    // --- Device side: the push plugin (optional peer), `usePushDevice` and the sign-in registration -----------------
    // `#push/native` only imports the plugin that is installed: `@capacitor-firebase/messaging` (the FCM token on iOS
    // too, so iOS pushes go through FCM and work from Cloudflare Workers), else `@capacitor/push-notifications`.
    const installed = (pkg: string) => isPackageInstalled(pkg, nuxt.options.rootDir, nuxt.options.modulesDir)
    const nativePlugin = detectNativePushPlugin(installed)
    if (nativePlugin === 'firebase' && installed('@capacitor/push-notifications')) {
      logger.warn('`@capacitor-firebase/messaging` and `@capacitor/push-notifications` are both installed: push uses Firebase Messaging. Remove `@capacitor/push-notifications`, the two must not run side by side.')
    }
    defineVirtualRegistry(nuxt, {
      filename: 'push/native.mjs',
      alias: '#push/native',
      collect: () => nativePlugin,
      contents: plugin => nativeLoaderTemplate(plugin, resolver.resolve('./runtime/app/utils/native')),
    })
    addTypeTemplate({
      filename: 'types/push-native.d.ts',
      getContents: () => `declare module '#push/native' {
  export const loadPushNotifications: import(${JSON.stringify(resolver.resolve('./runtime/app/utils/native'))}).NativePushLoader
}
`,
    })
    addImports([{ name: 'usePushDevice', from: resolver.resolve('./runtime/app/composables/usePushDevice') }])
    // Only a Capacitor app registers devices.
    if (hasNuxtModule('@frigear-nu/mobile', nuxt)) {
      addPlugin({ src: resolver.resolve('./runtime/app/plugins/push.client'), mode: 'client' })
    }

    if (!server) return

    // --- Server mode: access, tables, routes, topics, pages ---------------------------------------------------------
    // Permissions and the `push` scope (`runtime/access.ts`); the policy keeps `push:devices` to the user's own devices.
    registerAccess(nuxt, pushAccess)
    addPolicies(nuxt, { path: resolver.resolve('./runtime/server/policies') })
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))

    // Credentials are private runtime config: NUXT_PUSH_DRIVER, NUXT_PUSH_IOS, NUXT_PUSH_FCM_SERVICE_ACCOUNT,
    // NUXT_PUSH_APNS_*.
    const existing = nuxt.options.runtimeConfig.push as Partial<PushRuntimeConfig> | undefined
    nuxt.options.runtimeConfig.push = {
      driver: existing?.driver ?? settings.driver ?? '',
      timeoutMs: existing?.timeoutMs ?? 10_000,
      ios: existing?.ios ?? '',
      fcm: { serviceAccount: '', ...existing?.fcm },
      apns: { keyId: '', teamId: '', topic: '', privateKey: '', sandbox: false, ...existing?.apns },
    }

    registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // --- Topic registry -------------------------------------------------------------------------------------------
    // Modules add rows with `extendNotificationTopics` (`@frigear-nu/push/utils`); once every module is done they are
    // bundled into a virtual module for Nitro. The routes and `notifyUser` refuse topics that are not in it.
    defineVirtualRegistry(nuxt, {
      filename: '#push/topics',
      target: 'server',
      collect: (): NotificationTopic[] => nuxt.options.push?._topics ?? [],
      contents: topics => topicsTemplate(topics),
    })
    addTypeTemplate({
      filename: 'types/push-topics.d.ts',
      getContents: () => `declare module '#push/topics' {
  export const topics: import(${JSON.stringify(resolver.resolve('./types'))}).NotificationTopic[]
}
`,
    }, { nitro: true, nuxt: true })

    // --- API routes -----------------------------------------------------------------------------------------------
    addModuleRoutes(resolver, [
      { method: 'get', path: 'devices', file: 'me/devices.get' },
      { method: 'post', path: 'devices', file: 'me/devices.post' },
      { method: 'post', path: 'devices/unregister', file: 'me/unregister.post' },
      { method: 'delete', path: 'devices/:id', file: 'me/device.delete' },
      { method: 'get', path: 'channels', file: 'me/channels.get' },
      { method: 'patch', path: 'channels', file: 'me/channels.patch' },
    ], { base: '/api/push/me' })
    addModuleRoutes(resolver, [
      { method: 'post', path: 'test', file: 'admin/test.post' },
    ], { base: '/api/admin/push' })

    // A "Devices" tab on the admin user page of `@frigear-nu/users` with a "Send test push" action, and the staff route
    // behind it, authorized with `push:manage`.
    await extendUsersAdmin(nuxt, {
      routes: [{ method: 'get', path: 'push-devices', handler: resolver.resolve('./runtime/server/routes/admin/user-devices.get') }],
      tab: {
        id: 'push-devices',
        component: resolver.resolve('./runtime/app/tabs/Devices.vue'),
        order: 30,
        label: 'Devices',
        labelKey: 'push.admin.tab',
        icon: 'i-lucide-smartphone',
        permission: 'push:manage',
      },
    })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))

    // --- Account page ---------------------------------------------------------------------------------------------
    addModulePages(MODULE_NAME, resolver, [
      { name: 'push-notifications', path: notificationsPath, file: './runtime/app/pages/notifications.vue' },
    ])
    if (notificationsPath) addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'account' })
  },
})
