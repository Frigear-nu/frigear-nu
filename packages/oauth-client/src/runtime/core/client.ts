import { discover, endpointsFrom, normalizeIssuer } from './discovery'
import {
  OAuthAuthorizationError,
  OAuthConfigError,
  OAuthError,
  OAuthSessionError,
  OAuthTransientError,
  classifyTokenError,
  networkError,
} from './errors'
import { decodeJwtPayload, validateIdToken } from './jwt'
import { createDefaultLock } from './lock'
import { isCallbackUrlFor } from './urls'
import { createPkcePair, randomString } from './pkce'
import { defaultStorageKeyPrefix, memoryStorage, storageKeys } from './storage'
import type {
  AuthorizationUserAgent,
  IdTokenClaims,
  OAuthChangeEvent,
  OAuthClient,
  OAuthClientOptions,
  OAuthEndpoints,
  OAuthTokens,
  SignOutReason,
  UserInfo,
} from './types'

interface Pending {
  state: string
  verifier: string
  nonce?: string
  redirectUri: string
  returnTo: string | null
  createdAt: number
}

interface TokenResponse {
  access_token?: string
  token_type?: string
  refresh_token?: string
  id_token?: string
  expires_in?: number | string
  scope?: string
}

/** A same-window redirect: the browser comes back to the redirect URI, where the app calls `handleCallback`. */
export const redirectUserAgent = (): AuthorizationUserAgent => ({
  async open(url) {
    globalThis.location.assign(url)
  },
})

const toScope = (scope: OAuthClientOptions['scope']) =>
  (Array.isArray(scope) ? scope.join(' ') : scope ?? 'openid').split(/\s+/).filter(Boolean).join(' ')

/**
 * OAuth 2.1 authorization code + PKCE client for public clients (native apps, SPAs). It only needs `fetch` and
 * WebCrypto, so it runs in browsers, webviews, Node and workers. Works with `@frigear-nu/oauth-server` and any
 * standards compliant OpenID Connect provider.
 *
 * Refresh tokens are expected to rotate: a refresh token is single use, and using one twice makes the server revoke
 * the whole token family. Refreshes therefore run one at a time (single-flight within the page, a Web Lock across
 * tabs) and re-read the storage first, so a token another tab already rotated is picked up instead of reused.
 */
export function createOAuthClient(options: OAuthClientOptions): OAuthClient {
  const { clientId, redirectUri, clientSecret } = options
  if (!options.issuer) throw new OAuthConfigError('missing_issuer', 'The OAuth client has no issuer.')
  if (!clientId) throw new OAuthConfigError('missing_client_id', 'The OAuth client has no client id.')
  if (!redirectUri) throw new OAuthConfigError('missing_redirect_uri', 'The OAuth client has no redirect URI.')

  const issuer = normalizeIssuer(options.issuer)
  const scope = toScope(options.scope)
  const storage = options.storage ?? memoryStorage()
  const transient = options.transientStorage ?? storage
  const keys = storageKeys(options.storageKeyPrefix ?? defaultStorageKeyPrefix(clientId))
  const doFetch: typeof fetch = options.fetch ?? ((...args) => globalThis.fetch(...args))
  const now = options.now ?? Date.now
  const rewriteUrl = options.rewriteUrl ?? ((url: string) => url)
  const lock = options.lock ?? createDefaultLock()
  const userAgent = options.userAgent ?? redirectUserAgent()
  const skewMs = (options.refreshSkewSeconds ?? 30) * 1000
  const toleranceSeconds = options.clockToleranceSeconds ?? 120
  const pendingTtlMs = (options.pendingTtlSeconds ?? 3600) * 1000
  const lockName = `oauth-client:${issuer}:${clientId}:refresh`
  const sameIssuer = (value: string) => rewriteUrl(normalizeIssuer(value))

  const listeners = new Set<(event: OAuthChangeEvent) => void>()
  const emit = (event: OAuthChangeEvent) => {
    for (const listener of listeners) {
      try {
        listener(event)
      }
      catch {
        // A failing listener must not break the flow that emitted.
      }
    }
  }

  let endpoints: Promise<OAuthEndpoints> | null = null
  const getEndpoints = () => {
    endpoints ??= (async () => {
      const metadata = options.discovery === false ? null : await discover({ issuer, fetch: doFetch, rewriteUrl })
      const resolved = endpointsFrom(issuer, metadata, options.endpoints)
      return Object.fromEntries(Object.entries(resolved).map(([key, url]) => [key, rewriteUrl(url)])) as unknown as OAuthEndpoints
    })().catch((error) => {
      endpoints = null
      throw error
    })
    return endpoints
  }

  const readJson = async <T>(store: typeof storage, key: string): Promise<T | null> => {
    const raw = await store.get(key)
    if (!raw) return null
    try {
      return JSON.parse(raw) as T
    }
    catch {
      await store.remove(key)
      return null
    }
  }
  const readTokens = () => readJson<OAuthTokens>(storage, keys.tokens)
  const writeTokens = (tokens: OAuthTokens) => storage.set(keys.tokens, JSON.stringify(tokens))
  const isFresh = (tokens: OAuthTokens) => tokens.expiresAt - now() > skewMs

  async function post(url: string, params: Record<string, string>): Promise<Response> {
    const body = new URLSearchParams({ client_id: clientId, ...params })
    if (clientSecret) body.set('client_secret', clientSecret)
    try {
      return await doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'accept': 'application/json' },
        body,
      })
    }
    catch (cause) {
      throw networkError(url, cause)
    }
  }

  async function tokenRequest(params: Record<string, string>, previous: OAuthTokens | null, nonce?: string): Promise<OAuthTokens> {
    const { token } = await getEndpoints()
    const response = await post(token, params)
    const json = await response.json().catch(() => ({})) as TokenResponse & { error?: unknown, error_description?: unknown }
    if (!response.ok) throw classifyTokenError(response.status, json)
    if (!json.access_token) throw new OAuthConfigError('invalid_token_response', 'The token response has no access_token.', { status: response.status })

    const idToken = json.id_token ?? null
    if (idToken) {
      validateIdToken(idToken, { issuer, clientId, now: now(), toleranceSeconds, nonce, normalizeIssuer: sameIssuer })
    }
    const expiresIn = Number(json.expires_in)
    return {
      accessToken: json.access_token,
      // Servers that do not rotate omit `refresh_token` on refresh: the one we have stays valid.
      refreshToken: json.refresh_token ?? previous?.refreshToken ?? null,
      idToken: idToken ?? previous?.idToken ?? null,
      tokenType: json.token_type ?? 'Bearer',
      expiresAt: now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
      scope: json.scope ?? previous?.scope ?? scope,
    }
  }

  async function clear(reason: SignOutReason): Promise<OAuthTokens | null> {
    const tokens = await readTokens()
    await storage.remove(keys.tokens)
    await transient.remove(keys.pending)
    if (tokens) emit({ type: 'signed-out', tokens: null, reason })
    return tokens
  }

  /** Runs under the lock: re-reads the storage, and only refreshes when nobody else has meanwhile. */
  const refreshTokens = (seen: OAuthTokens, force: boolean) => lock(lockName, async (): Promise<OAuthTokens | null> => {
    const latest = await readTokens()
    if (!latest) return null
    // Another caller or tab rotated the tokens while we waited: use theirs, never reuse the old refresh token.
    if (latest.refreshToken !== seen.refreshToken || latest.accessToken !== seen.accessToken) return latest
    if (!force && isFresh(latest)) return latest
    if (!latest.refreshToken) {
      await clear('no_refresh_token')
      return null
    }
    try {
      const next = await tokenRequest({ grant_type: 'refresh_token', refresh_token: latest.refreshToken }, latest)
      await writeTokens(next)
      emit({ type: 'refreshed', tokens: next })
      return next
    }
    catch (error) {
      if (error instanceof OAuthSessionError) {
        await clear('invalid_grant')
        return null
      }
      const failure = error instanceof OAuthError ? error : new OAuthTransientError('refresh_failed', String(error), { cause: error })
      emit({ type: 'refresh-failed', tokens: latest, error: failure })
      throw failure
    }
  })

  let refreshing: Promise<OAuthTokens | null> | null = null

  const client: OAuthClient = {
    clientId,
    redirectUri,
    getEndpoints,

    async startAuthorization({ returnTo, params } = {}) {
      const { authorization } = await getEndpoints()
      const { verifier, challenge } = await createPkcePair()
      const state = randomString(24)
      const nonce = scope.split(' ').includes('openid') ? randomString(24) : undefined
      const pending: Pending = { state, verifier, nonce, redirectUri, returnTo: returnTo ?? null, createdAt: now() }
      await transient.set(keys.pending, JSON.stringify(pending))

      const url = new URL(authorization)
      // Extra parameters first, so they can never replace the ones the security of the flow depends on.
      for (const [key, value] of Object.entries({ ...options.authorizationParams, ...params })) url.searchParams.set(key, value)
      const required: Record<string, string> = {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }
      if (nonce) required.nonce = nonce
      for (const [key, value] of Object.entries(required)) url.searchParams.set(key, value)
      return { url: url.toString(), state }
    },

    async authorize({ onDismissed, ...rest } = {}) {
      const request = await client.startAuthorization(rest)
      await userAgent.open(request.url, { redirectUri, onDismissed })
      return request
    },

    isCallbackUrl: url => isCallbackUrlFor(redirectUri, url),

    async handleCallback(callbackUrl) {
      let params: URLSearchParams
      try {
        params = new URL(callbackUrl).searchParams
      }
      catch {
        throw new OAuthAuthorizationError('invalid_callback', 'The redirect URL is not valid.')
      }

      const pending = await readJson<Pending>(transient, keys.pending)
      if (!pending) throw new OAuthAuthorizationError('no_pending_authorization', 'No sign-in is in progress.')
      // Single use: a replayed or forged callback can never reuse this verifier.
      await transient.remove(keys.pending)

      if (params.get('state') !== pending.state) throw new OAuthAuthorizationError('invalid_state', 'The state parameter does not match.')
      if (now() - pending.createdAt > pendingTtlMs) throw new OAuthAuthorizationError('expired_authorization', 'The sign-in took too long. Start again.')
      // RFC 9207: a server that names itself must be the one we sent the user to.
      const iss = params.get('iss')
      if (iss && sameIssuer(iss) !== sameIssuer(issuer)) throw new OAuthAuthorizationError('issuer_mismatch', `The response came from "${iss}", not "${issuer}".`)

      const error = params.get('error')
      if (error) throw new OAuthAuthorizationError(error, params.get('error_description') ?? 'The sign-in was not completed.')

      const code = params.get('code')
      if (!code) throw new OAuthAuthorizationError('invalid_callback', 'The redirect URL has no authorization code.')

      let tokens: OAuthTokens
      try {
        tokens = await tokenRequest({
          grant_type: 'authorization_code',
          code,
          redirect_uri: pending.redirectUri,
          code_verifier: pending.verifier,
        }, null, pending.nonce)
      }
      catch (cause) {
        // A rejected code is a failed sign-in, not an ended session: there was none.
        if (cause instanceof OAuthSessionError) throw new OAuthAuthorizationError(cause.code, cause.message, { status: cause.status, cause })
        throw cause
      }
      await lock(lockName, () => writeTokens(tokens))
      emit({ type: 'signed-in', tokens })
      return { tokens, returnTo: pending.returnTo }
    },

    async getAccessToken({ forceRefresh = false, ifCurrent } = {}) {
      const tokens = await readTokens()
      if (!tokens) return null
      if (!forceRefresh && isFresh(tokens)) return tokens.accessToken
      if (forceRefresh && ifCurrent !== undefined && tokens.accessToken !== ifCurrent) return tokens.accessToken

      refreshing ??= refreshTokens(tokens, forceRefresh).finally(() => {
        refreshing = null
      })
      return (await refreshing)?.accessToken ?? null
    },

    getTokens: readTokens,

    async isAuthenticated() {
      return (await readTokens()) !== null
    },

    async getClaims(): Promise<IdTokenClaims | null> {
      const tokens = await readTokens()
      if (!tokens?.idToken) return null
      try {
        return decodeJwtPayload<IdTokenClaims>(tokens.idToken)
      }
      catch {
        return null
      }
    },

    async fetchUserInfo(): Promise<UserInfo> {
      const { userinfo } = await getEndpoints()
      if (!userinfo) throw new OAuthConfigError('no_userinfo_endpoint', `${issuer} has no userinfo endpoint.`)
      const response = await client.fetch(userinfo, { headers: { accept: 'application/json' } })
      if (response.status === 401) throw new OAuthSessionError('invalid_token', 'The access token was refused.', { status: 401 })
      if (response.status === 429 || response.status >= 500) throw new OAuthTransientError('server_error', `userinfo failed (${response.status}).`, { status: response.status })
      if (!response.ok) throw new OAuthConfigError('userinfo_failed', `userinfo failed (${response.status}).`, { status: response.status })
      return await response.json() as UserInfo
    },

    async fetch(input, init = {}) {
      const token = await client.getAccessToken()
      const send = (accessToken: string | null) => {
        const headers = new Headers(init.headers)
        if (accessToken) headers.set('authorization', `Bearer ${accessToken}`)
        return doFetch(input, { ...init, headers })
      }
      const response = await send(token)
      if (response.status !== 401 || !token) return response
      const next = await client.getAccessToken({ forceRefresh: true, ifCurrent: token }).catch(() => null)
      if (!next || next === token) return response
      return send(next)
    },

    async logout() {
      // Under the lock, so a refresh in flight cannot write tokens back after we cleared them.
      const tokens = await lock(lockName, () => clear('logout'))
      if (!tokens?.refreshToken) return
      try {
        const { revocation } = await getEndpoints()
        if (revocation) await post(revocation, { token: tokens.refreshToken, token_type_hint: 'refresh_token' })
      }
      catch {
        // Best effort: the local session is gone either way.
      }
    },

    async signOutLocally(reason = 'unauthorized') {
      await lock(lockName, () => clear(reason))
    },

    onChange(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
  return client
}
