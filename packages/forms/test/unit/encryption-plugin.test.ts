import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Config = { appSecret?: string, forms: { encryptionKey?: string }, encryptionKey?: string, session?: { password?: string } }

const APP_SECRET = 'a-test-only-app-secret-at-least-32-characters'
let config: Config
const initEncryptionKey = vi.fn()

vi.mock('nuxt/server', () => ({
  useRuntimeConfig: () => config,
  deriveSecret: async (purpose: string) => `derived:${purpose}`,
}))

/** Runs the plugin with its Nitro auto-imports stubbed and returns the secret it initialised the key with. */
async function runPlugin(): Promise<unknown> {
  const { default: plugin } = await import('../../src/runtime/server/plugins/encryption')
  await (plugin as () => Promise<void>)()
  expect(initEncryptionKey).toHaveBeenCalledOnce()
  return initEncryptionKey.mock.calls[0]![0]
}

describe('forms encryption plugin', () => {
  beforeEach(() => {
    vi.resetModules()
    initEncryptionKey.mockReset()
    config = { appSecret: APP_SECRET, forms: { encryptionKey: '' }, encryptionKey: '', session: { password: '' } }
    vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
    vi.stubGlobal('useRuntimeConfig', () => config)
    vi.stubGlobal('initEncryptionKey', initEncryptionKey)
    vi.stubGlobal('ENCRYPTION_KEY_PURPOSE', '@frigear-nu/forms:encryption')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('derives the key from NUXT_APP_SECRET when no key is set', async () => {
    expect(await runPlugin()).toBe('derived:@frigear-nu/forms:encryption')
  })

  it('keeps the deprecated session password ahead of the app secret', async () => {
    config.session = { password: 'session-password-value' }
    expect(await runPlugin()).toBe('session-password-value')
  })

  it('keeps the deprecated NUXT_ENCRYPTION_KEY ahead of the session password', async () => {
    config.encryptionKey = 'global-key'
    config.session = { password: 'session-password-value' }
    expect(await runPlugin()).toBe('global-key')
  })

  it('prefers the forms key over every fallback', async () => {
    config.forms.encryptionKey = 'forms-key'
    config.encryptionKey = 'global-key'
    config.session = { password: 'session-password-value' }
    expect(await runPlugin()).toBe('forms-key')
  })

  it('leaves the key unset without any secret', async () => {
    delete config.appSecret
    expect(await runPlugin()).toBe('')
  })
})
