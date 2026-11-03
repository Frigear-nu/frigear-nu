import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { loadNuxt } from '@nuxt/kit'

const rootDir = fileURLToPath(new URL('./fixtures/secret-guard', import.meta.url))

// The module setup runs while Nuxt loads, before anything is bundled, so a build would stop right there.
describe('secret guard', () => {
  afterEach(() => {
    delete process.env.NUXT_PUBLIC_OAUTH_CLIENT_SECRET
  })

  it('fails a production build when a client secret would be bundled', async () => {
    process.env.NUXT_PUBLIC_OAUTH_CLIENT_SECRET = 'leaked'
    await expect(loadNuxt({ cwd: rootDir, dev: false, ready: true })).rejects.toThrow(/NUXT_PUBLIC_OAUTH_CLIENT_SECRET is set/)
  })

  it('allows the same secret in development', async () => {
    process.env.NUXT_PUBLIC_OAUTH_CLIENT_SECRET = 'dev-only'
    const nuxt = await loadNuxt({ cwd: rootDir, dev: true, ready: true })
    expect((nuxt.options.runtimeConfig.public.oauthClient as { clientSecret: string }).clientSecret).toBe('dev-only')
    await nuxt.close()
  })

  it('loads without a secret', async () => {
    const nuxt = await loadNuxt({ cwd: rootDir, dev: false, ready: true })
    expect((nuxt.options.runtimeConfig.public.oauthClient as { clientId: string }).clientId).toBe('fixture-app')
    await nuxt.close()
  })
})
