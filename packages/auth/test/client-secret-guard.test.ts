import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { loadNuxt } from '@nuxt/kit'
import { SECRET_ENV_NAMES } from '../src/client-build'

const rootDir = fileURLToPath(new URL('./fixtures/client-secret-guard', import.meta.url))
const clientConfig = (nuxt: Awaited<ReturnType<typeof loadNuxt>>) =>
  (nuxt.options.runtimeConfig.public.authentication as { client: { clientId: string, clientSecret?: string } }).client

// The module setup runs while Nuxt loads, before anything is bundled, so a production build stops right there.
describe('client mode: secret guard', () => {
  afterEach(() => {
    for (const name of SECRET_ENV_NAMES) delete process.env[name]
  })

  it.each(SECRET_ENV_NAMES)('fails a production build when %s is set', async (name) => {
    process.env[name] = 'leaked'
    await expect(loadNuxt({ cwd: rootDir, dev: false, ready: true })).rejects.toThrow(new RegExp(`${name} is set`))
  })

  it('fails a production build with a secret in the config', async () => {
    await expect(loadNuxt({
      cwd: rootDir,
      dev: false,
      ready: true,
      overrides: { runtimeConfig: { public: { authentication: { client: { clientSecret: 'leaked' } } } } },
    })).rejects.toThrow(/runtimeConfig\.public\.authentication\.client\.clientSecret is set/)
  })

  it('allows the documented secret in development', async () => {
    process.env.NUXT_PUBLIC_AUTHENTICATION_CLIENT_SECRET = 'dev-only'
    const nuxt = await loadNuxt({ cwd: rootDir, dev: true, ready: true })
    expect(clientConfig(nuxt).clientSecret).toBe('dev-only')
    await nuxt.close()
  })

  it('loads without a secret, and does not declare one in production', async () => {
    const nuxt = await loadNuxt({ cwd: rootDir, dev: false, ready: true })
    expect(clientConfig(nuxt).clientId).toBe('fixture-app')
    expect(clientConfig(nuxt)).not.toHaveProperty('clientSecret')
    await nuxt.close()
  })
})
