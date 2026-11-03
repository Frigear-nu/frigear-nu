import { createMemoryLock, createOAuthClient, memoryStorage } from '../../src/runtime/core'
import type { LockFn, OAuthClientOptions, TokenStorage } from '../../src/runtime/core'

export const ISSUER = 'https://id.example.test'
export const REDIRECT = 'http://localhost:3222/auth/callback'

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** An unsigned JWT with these claims (the client does not verify id_token signatures). */
export const jwt = (claims: Record<string, unknown>) => {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'RS256', typ: 'JWT' })}.${part(claims)}.signature`
}

export const metadata = (overrides: Record<string, unknown> = {}) => ({
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/oauth/authorize`,
  token_endpoint: `${ISSUER}/oauth/token`,
  revocation_endpoint: `${ISSUER}/oauth/revoke`,
  userinfo_endpoint: `${ISSUER}/oauth/userinfo`,
  code_challenge_methods_supported: ['S256'],
  ...overrides,
})

export interface Call {
  url: string
  method: string
  body: URLSearchParams
  headers: Headers
}

export type Handler = (call: Call) => Response | Promise<Response>

/** A client against a scripted server. Discovery answers with `metadata()` unless `metadataHandler` is given. */
export function setup(handler: Handler, { metadataHandler, ...extra }: Partial<OAuthClientOptions> & { storage?: TokenStorage, lock?: LockFn, metadataHandler?: Handler } = {}) {
  const calls: Call[] = []
  const clock = { now: 1_000_000_000_000 }
  const storage = extra.storage ?? memoryStorage()
  const client = createOAuthClient({
    issuer: `${ISSUER}/`,
    clientId: 'app_1',
    redirectUri: REDIRECT,
    scope: 'bills:read',
    storage,
    lock: extra.lock ?? createMemoryLock(),
    now: () => clock.now,
    fetch: async (input, init) => {
      const call: Call = {
        url: String(input),
        method: init?.method ?? 'GET',
        body: new URLSearchParams(init?.body instanceof URLSearchParams ? init.body : undefined),
        headers: new Headers(init?.headers),
      }
      calls.push(call)
      if (call.url.includes('/.well-known/')) return metadataHandler ? metadataHandler(call) : json(metadata())
      return handler(call)
    },
    ...extra,
  })
  const grants = (type: string) => calls.filter(call => call.body.get('grant_type') === type)
  const requests = () => calls.filter(call => !call.url.includes('/.well-known/'))
  return { client, storage, calls, requests, grants, clock, advance: (ms: number) => (clock.now += ms) }
}

export const tokens = (n: number, extra: Record<string, unknown> = {}) =>
  json({ access_token: `access-${n}`, refresh_token: `refresh-${n}`, token_type: 'Bearer', expires_in: 3600, scope: 'bills:read', ...extra })

/** Runs a full sign-in against the scripted server. */
export async function signIn(ctx: ReturnType<typeof setup>, options: { returnTo?: string } = {}) {
  const { url } = await ctx.client.startAuthorization(options)
  const state = new URL(url).searchParams.get('state')
  return ctx.client.handleCallback(`${REDIRECT}?code=abc&state=${state}`)
}
