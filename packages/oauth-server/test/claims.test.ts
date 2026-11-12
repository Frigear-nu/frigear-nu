import { describe, expect, it, vi } from 'vitest'
import type { OAuthApplication, OAuthUser } from '../src/types'

// `buildClaims` without a server: the hook is a no-op.
vi.stubGlobal('useNitroApp', () => ({ hooks: { callHook: async () => {} } }))

const { buildClaims } = await import('../src/runtime/server/utils/oauth-access')

const application = { id: 'app_1' } as OAuthApplication
const user = (values: Partial<OAuthUser> = {}) => ({ id: 7, name: 'Ada', email: 'ada@example.test', avatar: null, ...values }) as OAuthUser

describe('buildClaims email_verified', () => {
  it('asserts email_verified from emailVerifiedAt, next to email', async () => {
    const verified = await buildClaims({ user: user({ emailVerifiedAt: new Date() }), application, scope: ['openid', 'email'], roles: [], tokenType: 'id_token' })
    expect(verified).toMatchObject({ email: 'ada@example.test', email_verified: true })

    const unverified = await buildClaims({ user: user({ emailVerifiedAt: null }), application, scope: ['openid', 'email'], roles: [], tokenType: 'id_token' })
    expect(unverified).toMatchObject({ email: 'ada@example.test', email_verified: false })
  })

  it('leaves both out without the email scope and in access tokens', async () => {
    const noScope = await buildClaims({ user: user({ emailVerifiedAt: new Date() }), application, scope: ['openid'], roles: [], tokenType: 'id_token' })
    expect(noScope).not.toHaveProperty('email_verified')
    const access = await buildClaims({ user: user({ emailVerifiedAt: new Date() }), application, scope: ['openid', 'email'], roles: [], tokenType: 'access_token' })
    expect(access).not.toHaveProperty('email')
    expect(access).not.toHaveProperty('email_verified')
  })
})
