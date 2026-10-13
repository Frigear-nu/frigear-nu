import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch } from '@nuxt/test-utils/e2e'

describe('frigear.nu sso (oauth.oidc belongs to another provider)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/frigear-sso-other-oidc', import.meta.url)),
  })

  it('does not treat the other provider as frigear.nu', async () => {
    expect(await $fetch('/api/auth/frigear-status')).toEqual({ enabled: false })
  })

  it('answers 404 from the route', async () => {
    const response = await fetch('/auth/frigear', { redirect: 'manual' })
    expect(response.status).toBe(404)
  })
})
