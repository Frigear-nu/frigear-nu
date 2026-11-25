import { beforeEach, describe, expect, it, vi } from 'vitest'

// Which secret seals kept OAuth tokens: `NUXT_AUTH_TOKENS_KEY`, else `NUXT_SESSION_PASSWORD` (the old fallback), else
// a key derived from `NUXT_APP_SECRET`. Checked through `getOAuthTokens`: a row sealed with the expected secret opens.
const config: { appSecret?: string, authTokensKey?: string, session?: { password?: string } } = {}
let row: Record<string, unknown> | undefined

vi.stubGlobal('cachedFunction', (fn: unknown) => fn)
vi.stubGlobal('useRuntimeConfig', () => config)
vi.mock('nuxt/server', () => ({
  useRuntimeConfig: () => config,
  deriveSecret: async (purpose: string) => `derived(${config.appSecret}, ${purpose})`,
}))
vi.mock('@nuxthub/db', () => ({
  db: { query: { authOAuthTokens: { findFirst: async () => row } } },
  schema: { authOAuthTokens: { userId: {}, provider: {} } },
}))

const { deriveOAuthTokensKey, getOAuthTokens, sealOAuthToken } = await import('../../src/runtime/server/utils/oauth-tokens')

const APP_SECRET = 'an-app-secret-of-at-least-32-characters'
const DERIVED = `derived(${APP_SECRET}, @frigear-nu/auth:oauth-tokens)`

async function sealRow(secret: string) {
  row = { accessToken: await sealOAuthToken(await deriveOAuthTokensKey(secret), 'access-1', 'oidc'), refreshToken: null, scopes: [] }
}
const accessToken = async () => (await getOAuthTokens(1, 'oidc'))?.accessToken ?? null

describe('the kept OAuth tokens key', () => {
  beforeEach(() => {
    Object.assign(config, { appSecret: undefined, authTokensKey: undefined, session: undefined })
    row = undefined
  })

  it('is derived from NUXT_APP_SECRET when nothing else is set', async () => {
    Object.assign(config, { appSecret: APP_SECRET, authTokensKey: '', session: { password: '' } })
    await sealRow(DERIVED)
    expect(await accessToken()).toBe('access-1')
  })

  it('prefers NUXT_AUTH_TOKENS_KEY, then NUXT_SESSION_PASSWORD, over the derived key', async () => {
    Object.assign(config, { appSecret: APP_SECRET, authTokensKey: 'the-tokens-key', session: { password: 'the-session-password' } })
    await sealRow('the-tokens-key')
    expect(await accessToken()).toBe('access-1')

    config.authTokensKey = ''
    expect(await accessToken()).toBeNull()
    await sealRow('the-session-password')
    expect(await accessToken()).toBe('access-1')
  })

  it('needs NUXT_APP_SECRET of 32+ characters without the other keys', async () => {
    Object.assign(config, { appSecret: 'too-short', authTokensKey: '', session: { password: '' } })
    await sealRow(DERIVED)
    await expect(getOAuthTokens(1, 'oidc')).rejects.toThrow('NUXT_APP_SECRET')
  })
})
