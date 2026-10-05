import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('account pages (opt-in, with navigation installed)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/pages-enabled', import.meta.url)),
  })

  it('renders the profile page at the default path', async () => {
    const html = await $fetch('/account/profile')
    expect(html).toContain('Profile')
  })

  it('renders the security page at the default path', async () => {
    const html = await $fetch('/account/security')
    expect(html).toContain('Change password')
  })

  it('renders the dashboard page with Profile/Security tiles', async () => {
    const html = await $fetch('/account')
    expect(html).toContain('Profile')
    expect(html).toContain('Security')
  })
})
