import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'

describe('account pages (guarded with @frigear-nu/authorization)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/guarded', import.meta.url)),
    setupTimeout: 240_000,
  })

  // `/da/...`: the guard covers every i18n locale prefix (auth's `guardPages`).
  it.each(['/account', '/account/profile', '/account/security', '/account/documents', '/account/api-tokens', '/account/membership', '/da/account', '/da/account/profile'])(
    'does not serve %s to guests',
    async (path) => {
      const response = await fetch(path, { redirect: 'manual' })
      expect(response.status).not.toBe(200)
      expect(response.status === 401 || response.headers.get('location')?.includes('/sign-in')).toBe(true)
    },
  )
})
