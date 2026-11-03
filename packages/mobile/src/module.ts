import { existsSync, readFileSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import {
  addComponent,
  addImports,
  addPlugin,
  addTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
  useLogger,
} from '@nuxt/kit'
import type { ModuleDependencyMeta, Nuxt, NuxtPage } from '@nuxt/schema'
import {
  addOptionalImports,
  defineVirtualRegistry,
  inlineModuleRuntime,
  registerLocales,
  registerModule,
  registerTailwindSource,
} from '@frigear-nu/module-kit/utils'
import { defu } from 'defu'
import type {
  MobileBackButtonContext,
  MobileDeepLinkContext,
  MobileNativeManifest,
  MobilePageMeta,
  MobilePublicConfig,
  MobileTab,
  MobileTabDefinition,
  ModuleOptions,
} from './types'
import { appIdScheme, isPackageInstalled, nativeLoaderTemplate, resolveDeepLinks, resolveLanHost, resolveSchemes, tabsTemplate, usedPlugins } from './build'
import { NATIVE_PLUGINS, type NativePluginName } from './runtime/shared/native'
import { findTabsWithoutPage, normalizeTabs } from './runtime/shared/tabs'
import { runDoctor } from './runtime/cli/doctor'

export type * from './types'

declare module 'nuxt/schema' {
  interface NuxtConfig {
    mobile?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    mobile: MobilePublicConfig
  }
}

declare module '#app' {
  interface PageMeta {
    /** Title, tab bar and navbar of this page in the mobile shell. */
    mobile?: MobilePageMeta
  }

  interface RuntimeNuxtHooks {
    /** A deep link opened the app (not an OAuth callback). Change `path`, or `preventDefault()` to handle it yourself. */
    'mobile:deep-link': (ctx: MobileDeepLinkContext) => void | Promise<void>
    /** The Android back button, before the module acts. `preventDefault()` when you handled it. */
    'mobile:back-button': (ctx: MobileBackButtonContext) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/mobile'
const FALLBACK_APP_ID = 'com.example.app'

type MobileOptionsInNuxt = ModuleOptions & { _tabs?: MobileTabDefinition[] }
const mobileOptionsOf = (nuxt: Nuxt): MobileOptionsInNuxt | undefined => {
  const value = (nuxt.options as { mobile?: MobileOptionsInNuxt | false }).mobile
  return value || undefined
}

// One LAN lookup per Nuxt instance: `moduleDependencies` and `setup` both need it.
const lanHosts = new WeakMap<Nuxt, string | undefined>()
function lanHostOf(nuxt: Nuxt): string | undefined {
  if (!lanHosts.has(nuxt)) {
    lanHosts.set(nuxt, resolveLanHost({
      dev: nuxt.options.dev,
      option: mobileOptionsOf(nuxt)?.dev?.lanHost ?? true,
      env: process.env,
      interfaces: networkInterfaces,
    }))
  }
  return lanHosts.get(nuxt)
}

const appIdOf = (nuxt: Nuxt): string | undefined => mobileOptionsOf(nuxt)?.appId
  ?? (nuxt.options as { capacitor?: { config?: { appId?: string } } }).capacitor?.config?.appId

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'mobile', compatibility: { nuxt: '>=4.0.0' } },
  // No array defaults: Nuxt merges options with defu, which would append the app's tabs to them.
  defaults: {
    spa: true,
    layout: 'mobile',
    nativeChrome: 'ios',
    native: { statusBar: true, keyboardAccessoryBar: true, switchHaptics: true, backButton: true },
    appearance: { iosTypeScale: true, tapHighlight: true, toasterOffset: true },
    dev: { lanHost: true },
    ios: { allowLocalNetworking: true },
    doctor: true,
  },
  moduleDependencies: (nuxt: Nuxt): Record<string, ModuleDependencyMeta> => {
    const appId: string = appIdOf(nuxt) ?? FALLBACK_APP_ID
    const appName: string = mobileOptionsOf(nuxt)?.appName
      ?? (nuxt.options as { capacitor?: { config?: { appName?: string } } }).capacitor?.config?.appName
      ?? appId
    const lanHost = lanHostOf(nuxt)
    const oauthConfigured = (nuxt.options as { oauthClient?: unknown }).oauthClient !== undefined
    // `nu.my_company.App` → `nu.my-company.app`: a URL scheme has no `_` and the OAuth client rejects one.
    const scheme = appIdScheme(appId)
    return {
      '@frigear-nu/module-kit': { version: '>=0.0.1' },
      '@nuxt/ui': { version: '>=4.0.0' },
      'nuxt-capacitor': {
        version: '>=0.3.3',
        defaults: {
          // On: every dev start would run `nuxt generate` and `cap sync`. Sync explicitly (`cap sync`).
          autoSync: false,
          config: {
            appId,
            appName,
            plugins: {
              // The WebView shrinks above the keyboard, so a sheet's dvh-based height keeps its actions in view.
              Keyboard: { resize: 'native', resizeOnFullScreen: true },
            },
          },
        },
      },
      ...(oauthConfigured
        ? {
            '@frigear-nu/oauth-client': {
              version: '>=0.1.0',
              // Scalars only: array defaults would be appended to the app's own (defu).
              defaults: {
                protect: 'all' as const,
                ...(scheme ? { native: { scheme } } : {}),
                ...(lanHost ? { dev: { rewriteLoopback: lanHost } } : {}),
              },
            },
          }
        : {}),
    }
  },
  setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    const logger = useLogger('mobile')
    inlineModuleRuntime(nuxt, resolver)
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    const prepare = !!nuxt.options._prepare

    const configuredAppId = appIdOf(nuxt)
    if (!configuredAppId && !prepare) logger.warn(`\`mobile.appId\` is not set: using "${FALLBACK_APP_ID}". Set your app's reverse-DNS id.`)
    const appId = configuredAppId ?? FALLBACK_APP_ID
    const appName = options.appName ?? (nuxt.options as { capacitor?: { config?: { appName?: string } } }).capacitor?.config?.appName ?? appId

    // Capacitor serves a static build from the device.
    if (options.spa !== false) nuxt.options.ssr = false

    // Head: edge-to-edge (`viewport-fit=cover`) and no zoom on focusing a field with text under 16px.
    const head = nuxt.options.app.head
    const defaultViewport = 'width=device-width, initial-scale=1'
    const mobileViewport = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover'
    if (!head.viewport || head.viewport === defaultViewport) head.viewport = mobileViewport
    head.meta ||= []
    // Nuxt renders the viewport from `head.meta` too; replace its default there, keep an app's own.
    for (const meta of head.meta) {
      if (meta.name === 'viewport' && meta.content === defaultViewport) meta.content = mobileViewport
    }
    const addMeta = (meta: { name: string, content: string, media?: string }) => {
      if (!head.meta!.some(existing => existing.name === meta.name && existing.media === meta.media)) head.meta!.push(meta)
    }
    addMeta({ name: 'format-detection', content: 'telephone=no' })
    addMeta({ name: 'theme-color', content: '#ffffff', media: '(prefers-color-scheme: light)' })
    addMeta({ name: 'theme-color', content: '#0a0a0a', media: '(prefers-color-scheme: dark)' })

    nuxt.options.css.push(resolver.resolve('./runtime/app/assets/mobile.css'))
    if (options.appearance?.tapHighlight !== false) nuxt.options.css.push(resolver.resolve('./runtime/app/assets/tap-highlight.css'))
    if (options.appearance?.iosTypeScale !== false) nuxt.options.css.push(resolver.resolve('./runtime/app/assets/ios-type-scale.css'))

    const lanHost = lanHostOf(nuxt)
    if (lanHost) logger.info(`MOBILE_LAN build: localhost in the issuer and API base becomes ${lanHost}.`)

    const deepLinks = resolveDeepLinks({ appId, schemes: options.deepLinks?.schemes, hosts: options.deepLinks?.hosts })
    if (deepLinks.errors.length) throw new Error(`[${MODULE_NAME}] Invalid deep links:\n- ${deepLinks.errors.join('\n- ')}`)
    if (!appIdScheme(appId) && options.deepLinks?.schemes === undefined && !prepare) logger.warn(`The app id "${appId}" makes no URL scheme: set \`deepLinks.schemes\` (and \`oauthClient.native.scheme\`).`)
    const deepLinkSchemes = deepLinks.schemes
    const publicDefaults: MobilePublicConfig = {
      appId,
      appName,
      auth: false,
      nativeChrome: options.nativeChrome ?? 'ios',
      layout: options.layout ?? 'mobile',
      toasterOffset: options.appearance?.toasterOffset !== false,
      native: {
        statusBar: options.native?.statusBar !== false,
        keyboardAccessoryBar: options.native?.keyboardAccessoryBar !== false,
        switchHaptics: options.native?.switchHaptics !== false,
        backButton: options.native?.backButton !== false,
      },
      deepLinks: { hosts: deepLinks.hosts, schemes: deepLinkSchemes },
      lanHost: lanHost ?? '',
    }
    const publicConfig = nuxt.options.runtimeConfig.public as { mobile?: Partial<MobilePublicConfig> }
    publicConfig.mobile = defu(publicConfig.mobile, publicDefaults) as MobilePublicConfig

    // Native plugins are optional peers: `#mobile/native` only imports the installed ones.
    const installed = (pkg: string) => isPackageInstalled(pkg, nuxt.options.rootDir, nuxt.options.modulesDir)
    const plugins = Object.fromEntries((Object.keys(NATIVE_PLUGINS) as NativePluginName[])
      .map(key => [key, installed(NATIVE_PLUGINS[key].pkg)])) as Record<NativePluginName, boolean>
    defineVirtualRegistry(nuxt, {
      filename: 'mobile/native.mjs',
      alias: '#mobile/native',
      collect: () => plugins,
      contents: nativeLoaderTemplate,
    })
    const shared = (file: string) => JSON.stringify(resolver.resolve(`./runtime/shared/${file}`))
    addTypeTemplate({
      filename: 'types/mobile.d.ts',
      getContents: () => `declare module '#mobile/native' {
  import type { NativePlugins } from ${shared('native')}
  export const plugins: { [K in keyof NativePlugins]: (() => Promise<NativePlugins[K]>) | null }
}
declare module '#mobile/tabs' {
  import type { MobileTab } from ${JSON.stringify(resolver.resolve('./types'))}
  export const tabs: MobileTab[]
}
`,
    })

    // Optional modules' composables, with stand-ins when they are not installed.
    addOptionalImports(nuxt, '#mobile/optional', [
      { name: 'useOAuth', available: () => hasNuxtModule('@frigear-nu/oauth-client', nuxt), fallback: 'undefined', fallbackType: `undefined | (() => { authenticated: import('vue').Ref<boolean>, isCallbackUrl: (url: string) => boolean })` },
      { name: 'useConfirmDialog', available: () => hasNuxtModule('@frigear-nu/ui', nuxt), fallback: 'undefined', fallbackType: `undefined | (() => (options: { title: string, description?: string, confirmText?: string, cancelText?: string, destructive?: boolean }) => Promise<boolean>)` },
      { name: 'useMenu', available: () => hasNuxtModule('@frigear-nu/menu', nuxt), fallback: 'undefined', fallbackType: `undefined | ((path: string) => { data: import('vue').Ref<import(${JSON.stringify(resolver.resolve('./runtime/shared/menu'))}).MenuItemLike[] | null | undefined> })` },
    ])

    // One tab registry: the app's `mobile.tabs`, then what modules added with `extendMobileTabs()`.
    let tabs: MobileTab[] = []
    nuxt.hook('modules:done', () => {
      const auth = options.auth ?? hasNuxtModule('@frigear-nu/oauth-client', nuxt)
      publicConfig.mobile!.auth = auth
      const nativeIcons = options.nativeChrome !== false && plugins.nativeNavigation
      const result = normalizeTabs([...(mobileOptionsOf(nuxt)?.tabs ?? []), ...(mobileOptionsOf(nuxt)?._tabs ?? [])], { auth, nativeIcons })
      if (result.errors.length) throw new Error(`[${MODULE_NAME}] Invalid tabs:\n- ${result.errors.join('\n- ')}`)
      if (!prepare) for (const warning of result.warnings) logger.warn(warning)
      tabs = result.tabs
    })
    defineVirtualRegistry(nuxt, {
      filename: 'mobile/tabs.mjs',
      alias: '#mobile/tabs',
      collect: () => tabs,
      contents: tabsTemplate,
    })
    nuxt.hook('pages:resolved', (pages) => {
      if (prepare || !tabs.length) return
      const paths: string[] = []
      const walk = (list: NuxtPage[], base = '') => list.forEach((page) => {
        const path = page.path.startsWith('/') ? page.path : `${base.replace(/\/$/, '')}/${page.path}`
        paths.push(path)
        if (page.children) walk(page.children, path)
      })
      walk(pages)
      for (const id of findTabsWithoutPage(tabs, paths)) {
        logger.warn(`Tab "${id}" opens ${tabs.find(tab => tab.id === id)?.to}, which is not a page of the app.`)
      }
    })

    addImports([
      { name: 'useCapacitor', from: resolver.resolve('./runtime/app/composables/useCapacitor') },
      { name: 'useMobileTabs', from: resolver.resolve('./runtime/app/composables/useMobileTabs') },
      { name: 'useMobileChrome', from: resolver.resolve('./runtime/app/composables/useMobileChrome') },
      { name: 'useMobileToaster', from: resolver.resolve('./runtime/app/composables/useMobileToaster') },
      { name: 'useNative', from: resolver.resolve('./runtime/app/composables/useNative') },
    ])
    for (const name of ['MobileTabBar', 'MobileHeader', 'MobileFab']) {
      addComponent({ name, filePath: resolver.resolve(`./runtime/app/components/${name}.vue`) })
    }

    addPlugin({ src: resolver.resolve('./runtime/app/plugins/mobile.client'), mode: 'client' })
    if (options.nativeChrome !== false && plugins.nativeNavigation) {
      addPlugin({ src: resolver.resolve('./runtime/app/plugins/native-navigation.client'), mode: 'client' })
    }
    if (plugins.app) {
      if (deepLinkSchemes.length || deepLinks.hosts.length) {
        addPlugin({ src: resolver.resolve('./runtime/app/plugins/deep-links.client'), mode: 'client' })
      }
      if (options.native?.backButton !== false) addPlugin({ src: resolver.resolve('./runtime/app/plugins/back-button.client'), mode: 'client' })
    }

    // The `mobile` layout, unless the app (or a layer) has one of that name; also the default layout when the app has none.
    const layout = options.layout ?? 'mobile'
    if (layout) {
      nuxt.hook('app:resolve', (app) => {
        app.layouts[layout] ||= { name: layout, file: resolver.resolve('./runtime/app/layouts/mobile.vue') }
        app.layouts.default ||= { ...app.layouts[layout], name: 'default' }
      })
    }

    // What the `frigear-mobile` CLI needs, and the doctor's checks on dev / build start.
    const manifest = (): MobileNativeManifest => {
      const oauth = (nuxt.options.runtimeConfig.public as { oauthClient?: { nativeRedirectUri?: string } }).oauthClient
      const redirectUri = oauth?.nativeRedirectUri ?? ''
      return {
        appId,
        appName,
        redirectUri,
        schemes: resolveSchemes(redirectUri, deepLinkSchemes),
        hosts: deepLinks.hosts,
        allowLocalNetworking: options.ios?.allowLocalNetworking !== false,
        plugins: usedPlugins({
          nativeChrome: options.nativeChrome !== false,
          statusBar: options.native?.statusBar !== false,
          keyboardAccessoryBar: options.native?.keyboardAccessoryBar !== false,
          oauth: hasNuxtModule('@frigear-nu/oauth-client', nuxt),
        }),
      }
    }
    addTemplate({ filename: 'mobile/native.json', write: true, getContents: () => `${JSON.stringify(manifest(), null, 2)}\n` })

    if (options.doctor !== false && !prepare && !nuxt.options.test) {
      nuxt.hook('modules:done', () => {
        const rootDir = nuxt.options.rootDir
        const read = (path: string) => (existsSync(join(rootDir, path)) ? readFileSync(join(rootDir, path), 'utf8') : null)
        let packageJson = null
        try {
          packageJson = JSON.parse(read('package.json') ?? 'null')
        }
        catch {
          // Not this module's problem.
        }
        for (const finding of runDoctor({ manifest: manifest(), packageJson, readFile: read })) {
          if (finding.level === 'info') logger.info(finding.message)
          else logger.warn(finding.message)
        }
      })
    }
  },
})
