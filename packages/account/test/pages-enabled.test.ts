import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('account pages (opt-in, with menus installed)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/pages-enabled', import.meta.url)),
    // Cold builds on shared CI runners can take longer than vitest's 120s default.
    setupTimeout: 240_000,
  })

  it('renders the profile page at the default path', async () => {
    const html = await $fetch('/account/profile')
    expect(html).toContain('Profile')
  })

  it('renders the security page at the default path', async () => {
    const html = await $fetch('/account/security')
    expect(html).toContain('Change password')
  })

  it('renders the overview page with Profile/Security shortcuts', async () => {
    const html = await $fetch('/account')
    expect(html).toContain('Profile')
    expect(html).toContain('Security')
  })

  it('renders the documents page listing unrestricted documents', async () => {
    const html = await $fetch('/account/documents')
    expect(html).toContain('Volunteer Handbook')
    expect(html).toContain('/assets/handbook.docx')
  })

  it('renders the API tokens page and lists it on the overview', async () => {
    const html = await $fetch('/account/api-tokens')
    expect(html).toContain('Create API token')
    expect(html).toContain('Your tokens')
    expect(html).toContain('You have not created any tokens yet.')
    expect(await $fetch('/account')).toContain('API tokens')
  })

  it('shows a Documents shortcut on the overview', async () => {
    expect(await $fetch('/account')).toContain('Documents')
  })
})
