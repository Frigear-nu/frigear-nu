import {
  addComponent,
  addImports,
  addPlugin,
  addRouteMiddleware,
  addTemplate,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
  useLogger,
} from '@nuxt/kit'
import { addModulePages, defineVirtualRegistry, inlineModuleRuntime, registerLocales, registerModule } from '@frigear-nu/module-kit/utils'
import { isAbsolute, resolve } from 'node:path'
import type { ModuleOptions, OAuthClientAppConfig, OAuthClientPublicConfig } from './types'
import type { IdTokenClaims, SignOutReason } from './runtime/core/types'
import type { OAuthError } from './runtime/core/errors'
import {
  assertNoClientSecretInBundle,
  checkNativeStorage,
  isPackageInstalled,
  mergePublicConfig,
  nativeLoaderTemplate,
  parseStorageOption,
  resolveNativeRedirectUri,
} from './build'

export type * from './types'

declare module 'nuxt/schema' {
  interface NuxtConfig {
    oauthClient?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    oauthClient: OAuthClientPublicConfig
  }

  interface AppConfigInput {
    oauthClient?: OAuthClientAppConfig
  }
}

declare module '#app' {
  interface PageMeta {
    /** `false`: reachable signed out with `protect: 'all'`. `true`: needs a signed-in user with `protect: 'none'`. */
    oauth?: boolean
  }

  interface RuntimeNuxtHooks {
    /** On the client, after a sign-in completed. */
    'oauth:signed-in': (ctx: { claims: IdTokenClaims | null }) => void | Promise<void>
    /** On the client, after the session ended (`logout`, a rejected refresh token, the API refusing the tokens). */
    'oauth:signed-out': (ctx: { reason: SignOutReason }) => void | Promise<void>
    /** On the client, when a refresh failed but the session was kept (offline, server error, client misconfigured). */
    'oauth:refresh-failed': (ctx: { error: OAuthError }) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/oauth-client'
const NATIVE_PLUGINS = {
  app: '@capacitor/app',
  browser: '@capacitor/browser',
  preferences: '@capacitor/preferences',
  secureStorage: '@aparajita/capacitor-secure-storage',
} as const

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'oauthClient', compatibility: { nuxt: '>=4.0.0' } },
  // No array defaults: Nuxt merges options with defu, which would append the user's scopes to them.
  defaults: {
    callbackPath: '/auth/callback',
    discovery: true,
    storage: 'auto',
    pages: { login: true, callback: true },
    protect: 'none',
    dev: { rewriteLoopback: true },
    allowClientSecretInBundle: false,
  },
  moduleDependencies: {
    // `useModuleT` for the pages and the sign-in button.
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
  },
  setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    const logger = useLogger('oauth-client')
    // Frozen: it keeps working, but new apps (and Mobile 0.2) use Auth's client mode.
    if (!nuxt.options._prepare) {
      logger.warn('`@frigear-nu/oauth-client` is deprecated: use `@frigear-nu/auth` with `authentication.mode: \'client\'`. Migration guide: https://docs.frigear.dev/modules/identity/auth/client-mode')
    }
    inlineModuleRuntime(nuxt, resolver)
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))

    const prepare = !!nuxt.options._prepare
    const callbackPath = `/${(options.callbackPath || '/auth/callback').replace(/^\/+/, '')}`
    const nativeRedirectUri = resolveNativeRedirectUri({ ...options.native, callbackPath }) ?? ''
    const loginPage = options.pages?.login === false ? undefined : (typeof options.pages?.login === 'string' ? options.pages.login : '/login')
    const loginPath = options.redirect?.login ?? loginPage ?? '/login'
    const protect = options.protect ?? 'none'
    const { mode: storage, file: storageFile } = parseStorageOption(options.storage)

    // The host's own `runtimeConfig.public.oauthClient` wins over the module options.
    const defaults: OAuthClientPublicConfig = {
      issuer: options.issuer ?? '',
      clientId: options.clientId ?? '',
      scope: (options.scopes ?? ['openid']).join(' '),
      apiBase: options.apiBase ?? '',
      redirectUri: options.redirectUri ?? '',
      nativeRedirectUri,
      callbackPath,
      discovery: options.discovery !== false,
      endpoints: options.endpoints ?? {},
      authorizationParams: options.authorizationParams ?? {},
      storage,
      protect,
      publicPaths: options.publicPaths ?? [],
      redirect: {
        login: loginPath,
        afterLogin: options.redirect?.afterLogin ?? '/',
        afterLogout: options.redirect?.afterLogout ?? (protect === 'all' ? loginPath : '/'),
      },
      api: { attachTo: options.api?.attachTo ?? [], onUnauthorized: options.api?.onUnauthorized ?? 'signOut' },
      rewriteLoopback: options.dev?.rewriteLoopback ?? true,
    }
    // Declared (so `NUXT_PUBLIC_OAUTH_CLIENT_CLIENT_SECRET` maps onto it) only where a secret is allowed: in production
    // a runtime env var would otherwise be serialized into every server-rendered page.
    const secretAllowed = nuxt.options.dev || options.allowClientSecretInBundle === true
    if (secretAllowed) defaults.clientSecret = ''
    const publicConfig = nuxt.options.runtimeConfig.public as { oauthClient?: Partial<OAuthClientPublicConfig> }
    publicConfig.oauthClient = mergePublicConfig(publicConfig.oauthClient, defaults)

    assertNoClientSecretInBundle({
      dev: nuxt.options.dev,
      prepare,
      allow: options.allowClientSecretInBundle === true,
      env: process.env,
      configured: publicConfig.oauthClient.clientSecret,
    })
    if (secretAllowed && process.env.NUXT_PUBLIC_OAUTH_CLIENT_SECRET && !publicConfig.oauthClient.clientSecret) {
      // The shorter variable is the documented one; Nuxt only maps `..._CLIENT_CLIENT_SECRET` on its own.
      publicConfig.oauthClient.clientSecret = process.env.NUXT_PUBLIC_OAUTH_CLIENT_SECRET
    }

    // Native plugins are optional peers: `#oauth-client/native` only imports the installed ones.
    const installed = (pkg: string) => isPackageInstalled(pkg, nuxt.options.rootDir, nuxt.options.modulesDir)
    const plugins = Object.fromEntries(Object.entries(NATIVE_PLUGINS).map(([key, pkg]) => [key, installed(pkg)])) as Record<keyof typeof NATIVE_PLUGINS, boolean>
    const { warning } = checkNativeStorage({
      mode: storage,
      dev: nuxt.options.dev,
      prepare,
      capacitor: installed('@capacitor/core'),
      secureStorage: plugins.secureStorage,
      preferences: plugins.preferences,
    })
    if (warning) logger.warn(warning)
    if (installed('@capacitor/core') && !plugins.browser) logger.warn('`@capacitor/browser` is not installed: a native app signs in by leaving the app for the system browser\'s redirect, which cannot come back. Install it.')
    if (installed('@capacitor/core') && !plugins.app) logger.warn('`@capacitor/app` is not installed: the app cannot receive the OAuth redirect. Install it.')
    const customStorage = storageFile && (isAbsolute(storageFile) || storageFile.startsWith('.') ? resolve(nuxt.options.rootDir, storageFile) : storageFile)

    defineVirtualRegistry(nuxt, {
      filename: 'oauth-client/native.mjs',
      alias: '#oauth-client/native',
      collect: () => ({ installed: plugins, customStorage }),
      contents: nativeLoaderTemplate,
    })
    // Next to the generated module, so TypeScript reads these types instead of inferring them from the JavaScript.
    const adapters = resolver.resolve('./runtime/capacitor/adapters')
    addTemplate({
      filename: 'oauth-client/native.d.mts',
      write: true,
      getContents: () => `import type { AppPluginLike, BrowserPluginLike, PreferencesPluginLike, SecureStoragePluginLike } from ${JSON.stringify(adapters)}
import type { TokenStorage } from ${JSON.stringify(resolver.resolve('./runtime/core/types'))}
export declare const plugins: {
  app: (() => Promise<AppPluginLike>) | null
  browser: (() => Promise<BrowserPluginLike>) | null
  preferences: (() => Promise<PreferencesPluginLike>) | null
  secureStorage: (() => Promise<SecureStoragePluginLike>) | null
}
export declare const customStorage: (() => Promise<TokenStorage | (() => TokenStorage | Promise<TokenStorage>)>) | null
`,
    })

    addImports([
      { name: 'useOAuth', from: resolver.resolve('./runtime/app/composables/useOAuth') },
      { name: 'useApi', from: resolver.resolve('./runtime/app/composables/useApi') },
    ])
    addPlugin({ src: resolver.resolve('./runtime/app/plugins/oauth.client'), mode: 'client' })
    addPlugin(resolver.resolve('./runtime/app/plugins/api'))
    addRouteMiddleware({ name: 'oauth', path: resolver.resolve('./runtime/app/middleware/oauth'), global: true })

    // The pages and the button are Nuxt UI components; without it the app brings its own.
    nuxt.hook('modules:done', () => {
      if (!hasNuxtModule('@nuxt/ui', nuxt)) {
        if (nuxt.options.dev && (loginPage || options.pages?.callback !== false)) {
          logger.info('`@nuxt/ui` is not installed: no /login and callback pages. Add your own (`useOAuth().login()` / `completeLogin()`).')
        }
        return
      }
      addComponent({ name: 'OAuthSignInButton', filePath: resolver.resolve('./runtime/app/components/OAuthSignInButton.vue') })
      addModulePages(MODULE_NAME, resolver, [
        { name: 'oauth-client-login', path: loginPage, file: './runtime/app/pages/login.vue' },
        { name: 'oauth-client-callback', path: options.pages?.callback === false ? undefined : callbackPath, file: './runtime/app/pages/callback.vue' },
      ])
    })
  },
})
