import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('login/register pages (opt-in)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/pages-enabled', import.meta.url)),
  })

  it('renders the login page at the default path', async () => {
    const html = await $fetch('/login')
    expect(html).toContain('Log in')
  })

  it('renders the register page at the default path', async () => {
    const html = await $fetch('/register')
    expect(html).toContain('Register')
  })
})
