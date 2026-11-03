// `@frigear-nu/auth/client-types`: the client mode's options, runtime config and the core's types.
import type { OAuthEndpoints } from './core/types'

export type * from './core/types'

/**
 * Where the tokens are kept:
 *
 * - `auto` (default): Keychain/Keystore (`@aparajita/capacitor-secure-storage`) on a device, `localStorage` in a browser.
 *   A production build of an app with `@capacitor/core` but without the secure storage plugin fails; set
 *   `preferences` to accept unencrypted storage.
 * - `secure`: Keychain/Keystore, required on a device.
 * - `preferences`: `@capacitor/preferences` (UserDefaults / SharedPreferences, not encrypted) on a device.
 * - `local` / `session`: `localStorage` / `sessionStorage`.
 * - `memory`: signed out on every reload.
 * - any other string: a file (relative to the app's `rootDir`, or a package) whose default export is a `TokenStorage`
 *   or a function returning one.
 */
export type StorageOption = 'auto' | 'secure' | 'preferences' | 'local' | 'session' | 'memory' | (string & {})

export type StorageMode = 'auto' | 'secure' | 'preferences' | 'local' | 'session' | 'memory' | 'custom'

/** `authentication.client`: the public OAuth client of `authentication.mode: 'client'`. */
export interface ClientModuleOptions {
  /** The issuer, e.g. `https://frigear.nu`. Env `NUXT_PUBLIC_AUTHENTICATION_CLIENT_ISSUER`. */
  issuer?: string
  /** The client id of a public client registered with the issuer. Env `NUXT_PUBLIC_AUTHENTICATION_CLIENT_CLIENT_ID`. */
  clientId?: string
  /**
   * Requested scopes; must contain `openid` (the user comes from the id_token). Default `['openid']`. Env
   * `NUXT_PUBLIC_AUTHENTICATION_CLIENT_SCOPE` (space separated).
   */
  scopes?: string[]
  /** Base URL of `$api` / `useApi`. Default: the issuer. Env `NUXT_PUBLIC_AUTHENTICATION_CLIENT_API_BASE`. */
  apiBase?: string
  /**
   * Origins `$api` / `useApi` send the bearer token to. Default: the `apiBase` and issuer origins. A request to any
   * other origin goes out without it.
   */
  apiOrigins?: string[]
  /**
   * What a 401 that a forced refresh did not fix does: `signOut` (default) clears the local session and sends the
   * visitor to the login page; `none` only throws.
   */
  onUnauthorized?: 'signOut' | 'none'
  /** The redirect URI in a browser. Default `<origin><callbackPath>`. */
  redirectUri?: string
  /** Path of the callback page, and of the redirect URIs derived from it. Default `/auth/callback`. */
  callbackPath?: string
  /** The redirect URI inside a Capacitor app. */
  native?: {
    /**
     * The custom URL scheme, usually the app id (`nu.frigear.app`). The redirect URI is
     * `<scheme in lowercase>:<callbackPath>`; schemes are case-insensitive and stored lowercase by iOS.
     */
    scheme?: string
    /** A full redirect URI instead (e.g. a claimed `https` universal link). */
    redirectUri?: string
  }
  /** Endpoints that win over discovered ones (absolute, or paths relative to the issuer). */
  endpoints?: Partial<OAuthEndpoints>
  /** OpenID Connect discovery. Default `true`; `false` uses the `@frigear-nu/oauth-server` paths. */
  discovery?: boolean
  /** Extra authorization request parameters (`prompt`, `audience`, ...). */
  authorizationParams?: Record<string, string>
  /** Default `auto`. */
  storage?: StorageOption
  redirect?: {
    /** Where `onUnauthorized: 'signOut'` and a failed native sign-in send the visitor. Default: the login page. */
    login?: string
    /** After sign-in, when the sign-in started without a `returnTo`. Default `/`. */
    afterLogin?: string
    /** After `logout()`. Default `/`. */
    afterLogout?: string
  }
  dev?: {
    /**
     * On a device, `localhost` is the phone. In development, rewrite a loopback issuer / `apiBase` to the host the app
     * was loaded from (Capacitor live reload), or to this host when a string. Default `true`.
     */
    rewriteLoopback?: boolean | string
  }
  /**
   * A production build fails when a client secret would be embedded in the bundle
   * (`NUXT_PUBLIC_AUTHENTICATION_CLIENT_CLIENT_SECRET`, `NUXT_PUBLIC_AUTHENTICATION_CLIENT_SECRET`, or the old
   * `NUXT_PUBLIC_OAUTH_CLIENT_SECRET` / `NUXT_PUBLIC_OAUTH_CLIENT_CLIENT_SECRET`). `true` allows it (throwaway local
   * builds against a confidential client only).
   */
  allowClientSecretInBundle?: boolean
}

/** `runtimeConfig.public.authentication.client`. */
export interface AuthClientPublicConfig {
  issuer: string
  clientId: string
  /** Space separated. */
  scope: string
  /** Empty: the issuer. */
  apiBase: string
  apiOrigins: string[]
  onUnauthorized: 'signOut' | 'none'
  redirectUri: string
  nativeRedirectUri: string
  callbackPath: string
  discovery: boolean
  endpoints: Partial<OAuthEndpoints>
  authorizationParams: Record<string, string>
  storage: StorageMode
  redirect: { login: string, afterLogin: string, afterLogout: string }
  rewriteLoopback: boolean | string
  /** Development against a confidential client only: only declared in `nuxt dev` (or with `allowClientSecretInBundle`). */
  clientSecret?: string
}

/** `app.config.ts` → `authentication`. */
export interface AuthAppConfig {
  /** The client mode's login page. */
  login?: {
    title?: string
    description?: string
    /** An image path, or one per colour mode. */
    logo?: string | { light: string, dark: string }
    /** A Nuxt UI icon shown when there is no logo, e.g. `i-lucide-wallet`. */
    icon?: string
  }
}

/** `unknown` until the stored tokens were read (and always during a server render). */
export type AuthStatus = 'unknown' | 'signed-in' | 'signed-out'
