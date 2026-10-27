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
    // GET falls through to the OAuth `:provider` route, which knows no provider called `tokens`.
    expect((await fetch('/api/auth/tokens')).status).toBe(404)
    // POST has no route at all, so it falls through to the app's SSR fallback.
    const created = await fetch('/api/auth/tokens', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"CI","scopes":[]}' })
    expect(await created.text()).toContain('<!DOCTYPE html')
  })
})
