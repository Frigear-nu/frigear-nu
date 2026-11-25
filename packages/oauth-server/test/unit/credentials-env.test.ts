import { describe, expect, it } from 'vitest'
import { credentialsEnv } from '../../src/runtime/utils'

describe('credentialsEnv', () => {
  it('gives a confidential client one Frigear Auth block and the OIDC block with its secret', () => {
    const env = credentialsEnv({ issuer: 'https://frigear.nu/', clientId: 'app_1', clientSecret: 's3cret', redirectUri: 'https://app.example.com/auth/frigear' })
    expect(env.frigear).toEqual([{
      text: 'NUXT_FRIGEAR_SSO_URL=https://frigear.nu\nNUXT_FRIGEAR_SSO_CLIENT_ID=app_1\nNUXT_FRIGEAR_SSO_CLIENT_SECRET=s3cret',
    }])
    expect(env.oidc).toEqual([{
      text: [
        'NUXT_OAUTH_OIDC_CLIENT_ID=app_1',
        'NUXT_OAUTH_OIDC_CLIENT_SECRET=s3cret',
        'NUXT_OAUTH_OIDC_OPENID_CONFIG=https://frigear.nu/.well-known/openid-configuration',
        'NUXT_OAUTH_OIDC_REDIRECT_URL=https://app.example.com/auth/frigear',
      ].join('\n'),
    }])
  })

  it('gives a public client labelled server and client blocks, and no secret anywhere', () => {
    const env = credentialsEnv({ issuer: 'https://frigear.nu', clientId: 'app_2', clientSecret: null })
    expect(env.frigear.map(block => block.label)).toEqual(['server', 'client'])
    expect(env.frigear[0]!.text).toBe('NUXT_FRIGEAR_SSO_URL=https://frigear.nu\nNUXT_FRIGEAR_SSO_CLIENT_ID=app_2')
    expect(env.frigear[1]!.text).toBe([
      'NUXT_PUBLIC_AUTHENTICATION_CLIENT_ISSUER=https://frigear.nu',
      'NUXT_PUBLIC_AUTHENTICATION_CLIENT_CLIENT_ID=app_2',
      'NUXT_PUBLIC_AUTHENTICATION_CLIENT_API_BASE=https://frigear.nu',
    ].join('\n'))
    const all = [...env.frigear, ...env.oidc].map(block => block.text).join('\n')
    expect(all).not.toContain('SECRET')
  })

  it('leaves out the redirect URL when it is not known', () => {
    const env = credentialsEnv({ issuer: 'https://frigear.nu', clientId: 'app_3', clientSecret: 'x', redirectUri: null })
    expect(env.oidc[0]!.text).not.toContain('REDIRECT_URL')
  })
})
