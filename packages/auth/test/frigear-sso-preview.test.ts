import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch } from '@nuxt/test-utils/e2e'

describe('frigear.nu sso (preview deployment)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/frigear-sso-preview', import.meta.url)),
  })

  it('exposes the login button', async () => {
    expect(await $fetch('/')).toContain('frigearSso:true')
  })

  it('registers the route (no 404) on a preview deployment', async () => {
    // Without credentials nuxt-auth-utils answers with its configuration error instead of a 404.
    const response = await fetch('/auth/frigear', { redirect: 'manual' })
    expect(response.status).not.toBe(404)
  })
})
