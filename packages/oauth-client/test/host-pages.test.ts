import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, setup } from '@nuxt/test-utils/e2e'

describe('host pages win', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/host-pages', import.meta.url)) })

  it('serves the app\'s own /login instead of the module page', async () => {
    const html = await $fetch<string>('/login')
    expect(html).toContain('Login page of the host app')
    expect(html).not.toContain('Sign in with your account to continue.')
  })

  it('still serves the module callback page', async () => {
    expect(await $fetch<string>('/auth/callback')).toContain('Signing you in…')
  })
})
