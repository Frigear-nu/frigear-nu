import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch } from '@nuxt/test-utils/e2e'
import { authApi } from '../src/runtime/utils/api'

describe('user API tokens (disabled)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/api-tokens-disabled', import.meta.url)),
  })

  it('reports them off in the public runtime config', async () => {
    expect(await $fetch('/')).toContain('apiTokens:false')
  })

  it('does not register the token routes', async () => {
    // No route at all, so both fall through to the app's SSR fallback.
    expect(await (await fetch(authApi.me.tokens)).text()).toContain('<!DOCTYPE html')
    const created = await fetch(authApi.me.tokens, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"CI","scopes":[]}' })
    expect(await created.text()).toContain('<!DOCTYPE html')
  })
})
