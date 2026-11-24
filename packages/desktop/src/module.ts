import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { addImports, addPlugin, addTemplate, addTypeTemplate, createResolver, defineNuxtModule, hasNuxtModule, useLogger } from '@nuxt/kit'
import type { ModuleDependencyMeta, Nuxt } from '@nuxt/schema'
import { addOptionalImports, defineVirtualRegistry, inlineModuleRuntime, registerModule } from '@frigear-nu/module-kit/utils'
import { defu } from 'defu'
import { resolveAuthMode } from '@frigear-nu/auth/mode'
import type { DesktopDeepLinkContext, DesktopManifest, DesktopPublicConfig, ModuleOptions } from './types'
import { assertClientAuth, isPackageInstalled, missingPluginWarnings, nativeLoaderTemplate } from './build'
import { appIdScheme, capabilities, resolveDesktopOptions, resolveSchemes, tauriConfig, toJson, usedPlugins } from './runtime/shared/config'
import { TAURI_PLUGINS, type TauriPluginName } from './runtime/shared/native'

export type * from './types'

declare module 'nuxt/schema' {
  interface NuxtConfig {
    desktop?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    desktop: DesktopPublicConfig
  }
}

declare module '#app' {
  interface RuntimeNuxtHooks {
    /** A deep link opened the app (not an OAuth callback). Change `path`, or `preventDefault()` to handle it yourself. */
    'desktop:deep-link': (ctx: DesktopDeepLinkContext) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/desktop'

const desktopOptionsOf = (nuxt: Nuxt): ModuleOptions | undefined => {
  const value = (nuxt.options as { desktop?: ModuleOptions | false }).desktop
  return value || undefined
}

function readPackageVersion(rootDir: string): string | undefined {
  try {
    const file = join(rootDir, 'package.json')
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { version?: string }).version : undefined
  }
  catch {
    return undefined
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'desktop', compatibility: { nuxt: '>=4.0.0' } },
  // No array defaults: Nuxt merges options with defu, which would append the app's own to them.
  defaults: {
    mode: 'remote',
    spa: true,
    singleInstance: true,
    autostart: false,
    updater: false,
    doctor: true,
  },
  moduleDependencies: (nuxt: Nuxt): Record<string, ModuleDependencyMeta> => {
    // Auth when the app configures it, with the app id as its deep-link scheme. Never its mode: that is the app's own
    // `authentication.mode`, and setup checks it is `client`.
    const authConfigured = (nuxt.options as { authentication?: unknown }).authentication !== undefined
    const appId = desktopOptionsOf(nuxt)?.appId
    const scheme = appId ? appIdScheme(appId) : undefined
    return {
      '@frigear-nu/module-kit': { version: '>=0.0.1' },
      ...(authConfigured
        ? {
            '@frigear-nu/auth': {
              version: '>=0.0.1',
              // Scalars only: array defaults would be appended to the app's own (defu).
              defaults: { client: { ...(scheme ? { native: { scheme } } : {}) } },
            },
          }
        : {}),
    }
  },
  setup(moduleOptions, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    const logger = useLogger('desktop')
    inlineModuleRuntime(nuxt, resolver)
    const prepare = !!nuxt.options._prepare

    const { options, errors, warnings } = resolveDesktopOptions(moduleOptions, {
      packageVersion: readPackageVersion(nuxt.options.rootDir),
      devPort: nuxt.options.devServer?.port,
      prepare,
    })
    if (errors.length) throw new Error(`[${MODULE_NAME}] Invalid desktop options:\n- ${errors.join('\n- ')}`)
    if (!prepare) for (const warning of warnings) logger.warn(warning)

    // Remote mode: Tauri serves the static build (`nuxt generate`) from the app bundle.
    if (options.spa) nuxt.options.ssr = false

    // Checked once every module is installed (Auth may be installed after this module, as its dependency).
    let clientAuth = false
    nuxt.hook('modules:done', () => {
      if (!hasNuxtModule('@frigear-nu/auth', nuxt)) return
      assertClientAuth(resolveAuthMode(nuxt))
      clientAuth = true
    })

    const publicDefaults: DesktopPublicConfig = {
      appId: options.appId,
      appName: options.appName,
      version: options.version,
      mode: options.mode,
      deepLinks: { schemes: options.deepLinks.schemes },
    }
    const publicConfig = nuxt.options.runtimeConfig.public as { desktop?: Partial<DesktopPublicConfig> }
    publicConfig.desktop = defu(publicConfig.desktop, publicDefaults) as DesktopPublicConfig

    // Tauri packages are optional peers: `#desktop/native` only imports the installed ones.
    const installed = (pkg: string) => isPackageInstalled(pkg, nuxt.options.rootDir, nuxt.options.modulesDir)
    const plugins = Object.fromEntries((Object.keys(TAURI_PLUGINS) as TauriPluginName[])
      .map(key => [key, installed(TAURI_PLUGINS[key].pkg)])) as Record<TauriPluginName, boolean>
    defineVirtualRegistry(nuxt, {
      filename: 'desktop/native.mjs',
      alias: '#desktop/native',
      collect: () => plugins,
      contents: nativeLoaderTemplate,
    })
    addTypeTemplate({
      filename: 'types/desktop.d.ts',
      getContents: () => `declare module '#desktop/native' {
  import type { TauriPlugins } from ${JSON.stringify(resolver.resolve('./runtime/shared/native'))}
  export const plugins: { [K in keyof TauriPlugins]: (() => Promise<TauriPlugins[K]>) | null }
}
`,
    })
    addOptionalImports(nuxt, '#desktop/optional', [
      { name: 'useAuth', available: () => clientAuth, fallback: 'undefined', fallbackType: `undefined | (() => { isCallbackUrl: (url: string) => boolean })` },
    ])

    addImports([{ name: 'useDesktop', from: resolver.resolve('./runtime/app/composables/useDesktop') }])
    addPlugin({ src: resolver.resolve('./runtime/app/plugins/desktop.client'), mode: 'client' })
    if (plugins.deepLink && options.deepLinks.schemes.length) {
      addPlugin({ src: resolver.resolve('./runtime/app/plugins/deep-links.client'), mode: 'client' })
    }

    // What the `frigear-desktop` CLI merges into `src-tauri/`.
    // Read once every module is done: Auth resolves the redirect URI from `native.scheme` in its setup.
    const redirectUri = () => (nuxt.options.runtimeConfig.public as { authentication?: { client?: { nativeRedirectUri?: string } } })
      .authentication?.client?.nativeRedirectUri ?? ''
    const manifest = (): DesktopManifest => {
      return {
        appId: options.appId,
        appName: options.appName,
        version: options.version,
        mode: options.mode,
        devUrl: options.devUrl,
        redirectUri: redirectUri(),
        schemes: resolveSchemes(redirectUri(), options.deepLinks.schemes),
        singleInstance: options.singleInstance,
        autostart: options.autostart,
        updater: !!options.updater,
        plugins: usedPlugins(options, clientAuth),
      }
    }
    addTemplate({ filename: 'desktop/tauri.json', write: true, getContents: () => toJson(tauriConfig(options, resolveSchemes(redirectUri(), options.deepLinks.schemes))) })
    addTemplate({ filename: 'desktop/capabilities.json', write: true, getContents: () => toJson(capabilities(options)) })
    addTemplate({ filename: 'desktop/manifest.json', write: true, getContents: () => toJson(manifest()) })

    if (moduleOptions.doctor !== false && !prepare && !nuxt.options.test) {
      nuxt.hook('modules:done', () => {
        for (const warning of missingPluginWarnings(manifest().plugins, installed)) logger.warn(warning)
      })
    }
  },
})
