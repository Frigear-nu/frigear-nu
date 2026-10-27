import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch } from '@nuxt/test-utils/e2e'

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
    expect(html).toContain('Sign up')
  })

  it('renders a confirm page for the emailed magic link instead of signing in on GET', async () => {
    const response = await fetch('/auth/magic-link?code=abc', { redirect: 'manual' })
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(await response.text()).toContain('Continue signing in')
  })

  it('tells guests sent from a protected page why they have to sign in', async () => {
    const generic = await $fetch<string>('/login?redirect=/account')
    expect(generic).toContain('You need to be signed in to do this')
    expect(generic).toContain('Afterwards you are sent straight back to where you were.')
    expect(await $fetch('/login')).not.toContain('You need to be signed in to do this')
    // A reason without strings (or not a key at all) falls back to the generic text.
    expect(await $fetch('/login?redirect=/account&reason=nope.missing')).toContain('You need to be signed in to do this')
    expect(await $fetch('/login?redirect=/account&reason=..%2F')).toContain('You need to be signed in to do this')
  })
})
