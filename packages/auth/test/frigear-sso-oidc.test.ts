import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch } from '@nuxt/test-utils/e2e'

describe('frigear.nu sso (credentials only in oauth.oidc, as NUXT_OAUTH_OIDC_*)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/frigear-sso-oidc', import.meta.url)),
  })

  it('reports the login method as enabled at request time', async () => {
    expect(await $fetch('/api/auth/frigear-status')).toEqual({ enabled: true })
  })

  it('registers the route (no 404)', async () => {
    const response = await fetch('/auth/frigear', { redirect: 'manual' })
    expect(response.status).not.toBe(404)
  })
})
