import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch } from '@nuxt/test-utils/e2e'

describe('user API tokens (disabled)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/api-tokens-disabled', import.meta.url)),
  })

  it('reports them off in the public runtime config', async () => {
    expect(await $fetch('/')).toContain('apiTokens:false')
  })

  it('does not register the token routes', async () => {
    // No route is registered, so the request falls through to the app's SSR fallback.
    for (const method of ['GET', 'POST']) {
      const response = await fetch('/api/auth/tokens', { method, headers: { 'content-type': 'application/json' }, body: method === 'POST' ? '{"name":"CI","scopes":[]}' : undefined })
      expect(await response.text()).toContain('<!DOCTYPE html')
    }
  })
})
