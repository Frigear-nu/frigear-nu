import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch } from '@nuxt/test-utils/e2e'

describe('frigear.nu sso (not a preview, no credentials)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/frigear-sso-off', import.meta.url)),
  })

  it('does not expose the login button', async () => {
    expect(await $fetch('/')).toContain('frigearSso:false')
  })

  it('answers 404 from the route', async () => {
    const response = await fetch('/auth/frigear', { redirect: 'manual' })
    expect(response.status).toBe(404)
  })
})
