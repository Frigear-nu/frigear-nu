import { useRuntimeConfig } from '#imports'
import { createOAuthClient, redirectUserAgent } from '../../core/client'
import { createSignInFlow } from '../../core/sign-in'
import type { SignInFlow } from '../../core/sign-in'
import { defaultStorageKeyPrefix, memoryStorage, storageKeys, webStorage } from '../../core/storage'
import type { OAuthClient, TokenStorage } from '../../core/types'
import { browserUserAgent, isNativePlatform, preferencesStorage, secureStorage, withInstallMarker } from '../../capacitor/adapters'
import type { AppPluginLike } from '../../capacitor/adapters'
import { loopbackRewriter, resolveRedirectUri } from '../../utils'
import type { OAuthClientPublicConfig } from '../../../types'

export interface OAuthRuntime {
  client: OAuthClient
  flow: SignInFlow
  native: boolean
  /** `@capacitor/app` inside a native app, when installed. */
  app: AppPluginLike | null
  /** The storage key of the tokens (cross-tab sync listens for it). */
  tokensKey: string
  apiBase: string
  /** Applied to `apiBase` too, so a device in development reaches the dev machine. */
  rewriteUrl: (url: string) => string
}

let runtime: Promise<OAuthRuntime> | undefined

/** The one OAuth client of the app, on the client side. Rejects on the server, where there are no tokens. */
export function getOAuthRuntime(onSigningIn?: (value: boolean) => void): Promise<OAuthRuntime> {
  if (import.meta.server) return Promise.reject(new Error('[@frigear-nu/oauth-client] The OAuth client only runs in the browser.'))
  if (!runtime) {
    // Read synchronously, while the Nuxt context is still available.
    const config = useRuntimeConfig().public.oauthClient
    runtime = createRuntime(config, onSigningIn).catch((error) => {
      runtime = undefined
      throw error
    })
  }
  return runtime
}

/** Picks the token storage, the pending-authorization storage and the user agent for this platform. */
async function createRuntime(config: OAuthClientPublicConfig, onSigningIn?: (value: boolean) => void): Promise<OAuthRuntime> {
  const { plugins, customStorage } = await import('#oauth-client/native')
  const native = isNativePlatform()
  const prefix = defaultStorageKeyPrefix(config.clientId)
  const keys = storageKeys(prefix)
  const preferences = native && plugins.preferences ? preferencesStorage(await plugins.preferences()) : null
  const local = webStorage(() => globalThis.localStorage)
  const session = webStorage(() => globalThis.sessionStorage)

  let storage: TokenStorage
  let transient: TokenStorage
  if (config.storage === 'custom' && customStorage) {
    const exported: unknown = await customStorage()
    storage = typeof exported === 'function' ? await (exported as () => TokenStorage | Promise<TokenStorage>)() : exported as TokenStorage
    transient = preferences ?? storage
  }
  else if (config.storage === 'memory') {
    storage = transient = memoryStorage()
  }
  else if (config.storage === 'session') {
    storage = transient = session
  }
  else if (native && (config.storage === 'auto' || config.storage === 'secure') && plugins.secureStorage) {
    const secure = secureStorage(await plugins.secureStorage())
    // Keychain items outlive a reinstall; the marker in Preferences does not.
    storage = preferences ? withInstallMarker(secure, { marker: preferences, keys: [keys.tokens], markerKey: `${prefix}installed` }) : secure
    transient = preferences ?? storage
  }
  else if (native && config.storage === 'secure') {
    throw new Error('[@frigear-nu/oauth-client] `storage: \'secure\'` needs `@aparajita/capacitor-secure-storage`.')
  }
  else if (native && preferences && config.storage !== 'local') {
    storage = transient = preferences
  }
  else {
    storage = transient = local
  }

  const rewriteUrl = loopbackRewriter(config.rewriteLoopback, globalThis.location?.hostname, import.meta.dev) ?? ((url: string) => url)
  const userAgent = native && plugins.browser ? browserUserAgent(await plugins.browser()) : redirectUserAgent()
  const redirectUri = resolveRedirectUri({
    native,
    origin: globalThis.location.origin,
    callbackPath: config.callbackPath,
    redirectUri: config.redirectUri,
    nativeRedirectUri: config.nativeRedirectUri,
  })

  const client = createOAuthClient({
    issuer: config.issuer,
    clientId: config.clientId,
    redirectUri,
    scope: config.scope,
    // Production builds that would embed one fail (`allowClientSecretInBundle`).
    clientSecret: config.clientSecret || undefined,
    storage,
    transientStorage: transient,
    storageKeyPrefix: prefix,
    discovery: config.discovery,
    endpoints: config.endpoints,
    authorizationParams: config.authorizationParams,
    userAgent,
    rewriteUrl,
  })
  return {
    client,
    flow: createSignInFlow(client, { userAgent, onChange: onSigningIn }),
    native,
    app: native && plugins.app ? await plugins.app() : null,
    tokensKey: keys.tokens,
    apiBase: rewriteUrl(config.apiBase || config.issuer),
    rewriteUrl,
  }
}
