import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch } from '@nuxt/test-utils/e2e'

describe('magic link & email verification', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/magic-link', import.meta.url)),
  })

  it('exposes the enabled features in the public runtime config', async () => {
    const html = await $fetch('/')
    expect(html).toContain('magicLink:true')
    expect(html).toContain('verifyEmail:true')
  })

  it('registers the magic link route and validates the request body', async () => {
    await expect($fetch('/api/auth/magic-link', {
      method: 'POST',
      body: { email: 'not-an-email' },
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('signs in only through the POST, which requires a valid code', async () => {
    await expect($fetch('/api/auth/magic-link/confirm', { method: 'POST', body: {} }))
      .rejects.toMatchObject({ statusCode: 400 })
    // Opening the emailed link is a plain page view: no sign-in, no session (the database flow is tested in
    // `@frigear-nu/users`' magic-link-flow test).
    const opened = await fetch('/auth/magic-link?code=nope', { redirect: 'manual' })
    expect(opened.status).not.toBe(302)
    expect(opened.headers.get('set-cookie')).toBeNull()
  })

  it('registers the Facebook OAuth route', async () => {
    // Without credentials nuxt-auth-utils answers with its configuration error instead of a 404.
    const response = await fetch('/api/auth/facebook', { redirect: 'manual' })
    expect(response.status).not.toBe(404)
  })
})
