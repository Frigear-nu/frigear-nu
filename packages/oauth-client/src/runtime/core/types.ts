import type { OAuthError } from './errors'

/**
 * Where tokens (and, as `transientStorage`, the pending authorization) live. Async so it can be backed by
 * Keychain / Keystore on a device; `memoryStorage()` and `webStorage()` ship with the core.
 */
export interface TokenStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

/**
 * Opens the authorization URL for the user: a same-window redirect in a browser, the in-app browser
 * (SFSafariViewController / Custom Tabs) on a device, or ASWebAuthenticationSession later.
 */
export interface AuthorizationUserAgent {
  /**
   * Shows `url`. Resolves once it is shown (a browser redirect never resolves in practice). `onDismissed` runs once if
   * the user closes it before the app does (`close`).
   */
  open(url: string, options: { redirectUri: string, onDismissed?: () => void }): Promise<void>
  /** Closes it after the redirect came back. Not a dismissal: `onDismissed` does not run. */
  close?(): Promise<void>
}

/** Runs `fn` while holding the lock `name`, one holder at a time (Web Locks across tabs, in memory otherwise). */
export type LockFn = <T>(name: string, fn: () => Promise<T>) => Promise<T>

export interface OAuthEndpoints {
  authorization: string
  token: string
  revocation?: string
  userinfo?: string
  endSession?: string
  jwks?: string
}

/** The fields of an RFC 8414 / OpenID Connect Discovery document the client reads. */
export interface AuthorizationServerMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  revocation_endpoint?: string
  userinfo_endpoint?: string
  end_session_endpoint?: string
  jwks_uri?: string
  authorization_response_iss_parameter_supported?: boolean
  code_challenge_methods_supported?: string[]
  scopes_supported?: string[]
  [key: string]: unknown
}

export interface OAuthClientOptions {
  /** The issuer identifier, e.g. `https://frigear.nu`. Discovery documents and id_tokens must name exactly this issuer. */
  issuer: string
  clientId: string
  /** Must exactly match a redirect URI registered for the client. */
  redirectUri: string
  /** Space separated, or a list. Default `openid`. */
  scope?: string | string[]
  /**
   * Only for confidential clients while developing. Public clients (apps, SPAs) have none: a secret inside an app
   * bundle is not a secret.
   */
  clientSecret?: string
  /** Tokens. Default: in memory. */
  storage?: TokenStorage
  /** The pending authorization (PKCE verifier, state, nonce). Default: `storage`. */
  transientStorage?: TokenStorage
  /** Prefix of every storage key. Default `oauth:<clientId>:`. */
  storageKeyPrefix?: string
  /**
   * Read the endpoints from `<issuer>/.well-known/openid-configuration` (falling back to
   * `/.well-known/oauth-authorization-server`). Default `true`. With `false` the endpoints default to the
   * `@frigear-nu/oauth-server` paths (`/oauth/authorize`, `/oauth/token`, ...) unless `endpoints` names them.
   */
  discovery?: boolean
  /** Endpoints that win over discovered ones (absolute URLs, or paths relative to the issuer). */
  endpoints?: Partial<OAuthEndpoints>
  /** Extra authorization request parameters (`prompt`, `audience`, `ui_locales`, ...). */
  authorizationParams?: Record<string, string>
  /** How `authorize()` shows the authorization URL. Default: a same-window redirect (`window.location.assign`). */
  userAgent?: AuthorizationUserAgent
  /** Default: Web Locks when the platform has them, else an in-memory lock. */
  lock?: LockFn
  /**
   * Rewrites every URL the client requests or opens (not the issuer it validates), e.g. `localhost` to the dev
   * machine's LAN address on a device.
   */
  rewriteUrl?: (url: string) => string
  fetch?: typeof fetch
  /** Overridable for tests. Epoch milliseconds. */
  now?: () => number
  /** Refresh when the access token expires within this many seconds. Default 30. */
  refreshSkewSeconds?: number
  /**
   * Origins `client.fetch` sends the bearer token to. Default: the issuer's. A request to any other origin goes out
   * without it, so a token never leaks to a third party through a mistyped or attacker-supplied URL.
   */
  attachTo?: string[]
  /** Requests to the authorization server (discovery, token, revocation, userinfo) give up after this. Default 15; 0 for none. */
  requestTimeoutSeconds?: number
  /** Problems that do not fail the operation (e.g. a refreshed id_token that was not accepted). Default `console.warn`. */
  onWarning?: (message: string, error?: unknown) => void
  /** How long a started authorization can be completed, in seconds. Default 3600. */
  pendingTtlSeconds?: number
}

export interface OAuthTokens {
  accessToken: string
  refreshToken: string | null
  idToken: string | null
  tokenType: string
  /** Epoch milliseconds. */
  expiresAt: number
  scope: string
}

/** The claims of an id_token. */
export interface IdTokenClaims {
  iss: string
  sub: string
  aud: string | string[]
  exp: number
  iat?: number
  nonce?: string
  azp?: string
  auth_time?: number
  name?: string
  email?: string
  email_verified?: boolean
  picture?: string
  [claim: string]: unknown
}

export interface UserInfo {
  sub: string
  [claim: string]: unknown
}

export type OAuthChangeEvent
  = | { type: 'signed-in', tokens: OAuthTokens }
    | { type: 'refreshed', tokens: OAuthTokens }
    | { type: 'signed-out', tokens: null, reason: SignOutReason }
    | { type: 'refresh-failed', tokens: OAuthTokens, error: OAuthError }

/** `logout`: the app signed out; `invalid_grant`: the server ended the session; `unauthorized`: the API refused the tokens. */
export type SignOutReason = 'logout' | 'invalid_grant' | 'no_refresh_token' | 'unauthorized' | 'storage'

export interface AuthorizationRequest {
  url: string
  state: string
}

export interface CallbackResult {
  tokens: OAuthTokens
  /** The `returnTo` passed to `startAuthorization`. */
  returnTo: string | null
}

export interface GetAccessTokenOptions {
  /** Refresh even when the stored token is still fresh (e.g. the API answered 401). */
  forceRefresh?: boolean
  /**
   * With `forceRefresh`: the access token the caller saw rejected. When the stored token is already a different one
   * (another caller or tab refreshed meanwhile), that one is returned without a second refresh.
   */
  ifCurrent?: string
}

export interface OAuthClient {
  readonly clientId: string
  readonly redirectUri: string
  /** The resolved endpoints (runs discovery once). */
  getEndpoints(): Promise<OAuthEndpoints>
  /** Builds the authorization URL and stores the PKCE verifier, `state` and `nonce`. */
  startAuthorization(options?: { returnTo?: string, params?: Record<string, string> }): Promise<AuthorizationRequest>
  /** `startAuthorization`, then shows the URL through the `userAgent`. */
  authorize(options?: { returnTo?: string, params?: Record<string, string>, onDismissed?: () => void }): Promise<AuthorizationRequest>
  /** Whether `url` is this client's redirect URI carrying an authorization response. */
  isCallbackUrl(url: string): boolean
  /**
   * Whether `url` answers a sign-in this client started (its `state` is pending). Check it before acting on a URL
   * handed to the app from outside (deep links): a forged callback must not end a real sign-in.
   */
  matchesPendingAuthorization(url: string): Promise<boolean>
  /** Validates `state`, exchanges the code, validates the id_token and stores the tokens. Pass the full redirect URL. */
  handleCallback(callbackUrl: string): Promise<CallbackResult>
  /**
   * A valid access token, refreshing when it is (nearly) expired, or `null` when signed out. Concurrent calls, and
   * other tabs sharing the storage, share one refresh.
   */
  getAccessToken(options?: GetAccessTokenOptions): Promise<string | null>
  getTokens(): Promise<OAuthTokens | null>
  isAuthenticated(): Promise<boolean>
  /** The claims of the stored id_token (validated when it was received), or `null`. */
  getClaims(): Promise<IdTokenClaims | null>
  /** `GET` the userinfo endpoint with the access token. */
  fetchUserInfo(): Promise<UserInfo>
  /**
   * `fetch` with the bearer token for `attachTo` origins only; a 401 refreshes once and retries. A refresh that fails
   * transiently rejects with its `OAuthTransientError`; an ended session returns the 401 response.
   */
  fetch(input: string | URL, init?: RequestInit): Promise<Response>
  /** Clears local state and revokes the refresh token (best effort). */
  logout(): Promise<void>
  /** Clears the local session without contacting the server (e.g. the API keeps refusing the tokens). */
  signOutLocally(reason?: SignOutReason): Promise<void>
  /** Called on sign-in, refresh, sign-out and failed refreshes. Returns an unsubscribe. */
  onChange(listener: (event: OAuthChangeEvent) => void): () => void
}
