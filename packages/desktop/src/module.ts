import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { addImports, addPlugin, addTemplate, addTypeTemplate, createResolver, defineNuxtModule, hasNuxtModule, useLogger } from '@nuxt/kit'
import type { ModuleDependencyMeta, Nuxt } from '@nuxt/schema'
import { addOptionalImports, defineVirtualRegistry, inlineModuleRuntime, registerModule } from '@frigear-nu/module-kit/utils'
import { defu } from 'defu'
import { resolveAuthMode } from '@frigear-nu/auth/mode'
import type { DesktopDeepLinkContext, DesktopManifest, DesktopPublicConfig, ModuleOptions } from './types'
import {
  applyLocalNitroConfig, assertClientAuth, assertServerAuth, isCheckedNuxtHubVersion, isPackageInstalled, localBootstrapTemplate,
  localDbTemplate, localEntryTemplate, missingPluginWarnings, nativeLoaderTemplate, NUXTHUB_SEAM, type LocalNitroConfig,
} from './build'
import type { SecretName } from './runtime/shared/local-secrets'
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

function readPackageVersion(rootDir: string, pkg?: string): string | undefined {
  try {
    const file = pkg ? join(rootDir, 'node_modules', pkg, 'package.json') : join(rootDir, 'package.json')
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { version?: string }).version : undefined
  }
  catch {
    return undefined
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'desktop', compatibility: { nuxt: '>=4.0.0' } },
  // No array defaults: Nuxt merges options with defu, which would append the app's own to them.
  // `spa` has no default here: it depends on the mode (`resolveDesktopOptions`).
  defaults: {
    mode: 'remote',
    singleInstance: true,
    autostart: false,
    updater: false,
    doctor: true,
  },
  moduleDependencies: (nuxt: Nuxt): Record<string, ModuleDependencyMeta> => {
    // Auth when the app configures it. Never its mode: that is the app's own `authentication.mode`, and setup checks it
    // (`client` in remote mode, `server` in local mode).
    const authConfigured = (nuxt.options as { authentication?: unknown }).authentication !== undefined
    const desktop = desktopOptionsOf(nuxt)
    if (desktop?.mode === 'local') {
      // Offline defaults the app can override: no emailed verification (nobody receives the email), emailed links from
      // the request origin (the port changes every start), and in builds NuxtHub KV for sign-in throttling (fs-lite in
      // `.data/kv`, inside the data folder at runtime). Not under `nuxt dev`, where throttling is off and NuxtHub's
      // generated KV would import `unstorage` from the app, which pnpm apps do not have. Scalars only: array defaults
      // would be appended to the app's own (defu).
      return {
        '@frigear-nu/module-kit': { version: '>=0.0.1' },
        '@frigear-nu/auth': {
          version: '>=0.0.1',
          optional: !authConfigured,
          defaults: { settings: { verifyEmail: false, trustRequestOrigin: true } },
        },
        ...(nuxt.options.dev ? {} : { '@nuxthub/core': { optional: true, defaults: { kv: true } } }),
      }
    }
    // Remote mode: the app id is Auth's deep-link scheme.
    const appId = desktop?.appId
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
      if (options.local) {
        assertServerAuth(resolveAuthMode(nuxt))
        const settings = (nuxt.options as { authentication?: { settings?: { verifyEmail?: boolean } } }).authentication?.settings
        if (settings?.verifyEmail === true && !prepare) {
          logger.warn('`authentication.settings.verifyEmail` is on in local mode: the verification email cannot reach anyone offline, so new accounts cannot sign in. Turn it off for the desktop build.')
        }
        return
      }
      assertClientAuth(resolveAuthMode(nuxt))
      clientAuth = true
    })

    if (options.local) setupLocalMode(nuxt, options.local, resolver, prepare)

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
        local: options.local ? { binaryName: options.local.binaryName, port: options.local.port, dataDirName: options.local.dataDirName } : null,
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

const LOCAL_ENTRY = '#desktop/local-entry'

interface HubRuntimeConfig {
  dir?: string
  db?: false | { dialect?: string, casing?: string, applyMigrationsDuringBuild?: boolean }
}

/**
 * Local mode. Always: the session cookie option. In a production build (`nuxt build`, what `frigear-desktop build`
 * runs): the bundled server, see `applyLocalNitroConfig`. `nuxt dev` keeps NuxtHub's own driver and migrations.
 */
function setupLocalMode(nuxt: Nuxt, local: NonNullable<ReturnType<typeof resolveDesktopOptions>['options']['local']>, resolver: ReturnType<typeof createResolver>, prepare: boolean) {
  const logger = useLogger('desktop')
  if (!local.secureCookie) {
    // The fallback for a webview that drops a `Secure` cookie on http://127.0.0.1 (nuxt-auth-utils' session cookie).
    const config = nuxt.options.runtimeConfig as { session?: { cookie?: Record<string, unknown> } }
    const session = config.session ??= {}
    session.cookie = { ...session.cookie, secure: false }
  }

  if (nuxt.options.dev || prepare || nuxt.options.test) return
  if ((nuxt.options as { _generate?: boolean })._generate) {
    throw new Error('[@frigear-nu/desktop] Local mode bundles a server: build it with `nuxt build` (`frigear-desktop build`), not `nuxt generate`.')
  }

  const hub = () => (nuxt.options.runtimeConfig as { hub?: HubRuntimeConfig }).hub
  const hasDb = () => !!hub()?.db
  nuxt.hook('modules:done', () => {
    const db = hub()?.db
    if (!db) {
      if (!hasNuxtModule('@nuxthub/core', nuxt)) logger.info('Local mode without NuxtHub (`hub.db`): the bundled server has no database.')
      return
    }
    if (db.dialect !== 'sqlite') {
      throw new Error(`[@frigear-nu/desktop] Local mode needs \`hub.db\` with the sqlite dialect, got ${JSON.stringify(db.dialect)}.`)
    }
    // The build machine's database is not the app's: the bundled server migrates its own at startup.
    db.applyMigrationsDuringBuild = false
    const version = readPackageVersion(nuxt.options.rootDir, '@nuxthub/core')
    if (!isCheckedNuxtHubVersion(version)) {
      logger.warn(`Local mode replaces NuxtHub's generated database client, which was checked with @nuxthub/core ${NUXTHUB_SEAM.versions.join(', ')}, not ${version ?? 'this version'}. Test the desktop build before you release it.`)
    }
  })

  // The secrets of one installation, generated on its first start (see `prepareLocalServer`).
  const secrets = (): SecretName[] => {
    const names: SecretName[] = ['NUXT_APP_SECRET']
    if (hasNuxtModule('@frigear-nu/auth', nuxt)) names.push('NUXT_AUTH_TOKENS_KEY')
    if (hasNuxtModule('@frigear-nu/oauth-server', nuxt)) names.push('NUXT_OAUTH_SERVER_PRIVATE_KEY')
    return names
  }
  const localDb = addTemplate({
    filename: 'desktop/local/db.mjs',
    write: true,
    getContents: () => hasDb()
      ? localDbTemplate(resolver.resolve('./runtime/shared/local-db'), (hub()?.db || undefined)?.casing)
      : '// Generated by @frigear-nu/desktop (local mode): no `hub.db`.\nexport const sqlite = null\n',
  })
  const bootstrap = addTemplate({
    filename: 'desktop/local/bootstrap.mjs',
    write: true,
    getContents: () => localBootstrapTemplate(resolver.resolve('./runtime/server/local/bootstrap'), { port: local.port, secrets: secrets() }),
  })

  nuxt.hook('nitro:config', (nitroConfig) => {
    const hubDir = hub()?.dir
    applyLocalNitroConfig(nitroConfig as LocalNitroConfig, {
      dbModule: localDb.dst,
      hubDb: hasDb(),
      schemaModule: join(nuxt.options.rootDir, ...NUXTHUB_SEAM.schemaFile),
      migrationsDir: hasDb() && hubDir ? join(hubDir, ...NUXTHUB_SEAM.migrationsDir) : null,
      plugin: resolver.resolve('./runtime/server/local/plugin'),
    })
  })

  nuxt.hook('nitro:init', (nitro) => {
    if (hasDb() && !existsSync(join(nuxt.options.rootDir, ...NUXTHUB_SEAM.schemaFile))) {
      throw new Error(`[@frigear-nu/desktop] NuxtHub's generated schema (${NUXTHUB_SEAM.schemaFile.join('/')}) is missing: local mode keeps it and replaces only the client. Has @nuxthub/core changed where it writes it?`)
    }
    // The bootstrap goes first: it sets the env (data folder, port, secrets) Nitro's runtime config is read from. A
    // virtual module, since Nuxt clears unknown files from the build dir before Nitro builds.
    // Nitro tree-shakes the side effects of modules it does not list, and both imports are nothing but side effects.
    nitro.options.moduleSideEffects.push(bootstrap.dst, nitro.options.entry)
    nitro.options.virtual[LOCAL_ENTRY] = localEntryTemplate(bootstrap.dst, nitro.options.entry)
    nitro.options.entry = LOCAL_ENTRY
  })
}
