import { beforeEach, describe, expect, it, vi } from 'vitest'

const config: { appSecret?: unknown } = {}
vi.mock('nuxt/server', () => ({
  useRuntimeConfig: () => config,
  deriveSecret: async (purpose: string) => `derived:${purpose}`,
}))

const { hasAppSecret, pickSecret, resolveSecret } = await import('../src/runtime/server/secret')

const APP_SECRET = 'a-test-only-app-secret-at-least-32-characters'

describe('module secrets', () => {
  beforeEach(() => {
    delete config.appSecret
  })

  it('picks the first non-empty string, trimmed', () => {
    expect(pickSecret(undefined, '', '  ', 42, ' own ', 'later')).toBe('own')
    expect(pickSecret(undefined, null)).toBe('')
  })

  it('needs an appSecret of 32+ characters', () => {
    expect(hasAppSecret()).toBe(false)
    config.appSecret = 'short'
    expect(hasAppSecret()).toBe(false)
    config.appSecret = ['not', 'a', 'string']
    expect(hasAppSecret()).toBe(false)
    config.appSecret = APP_SECRET
    expect(hasAppSecret()).toBe(true)
  })

  it('prefers its own keys, then derives from appSecret, else is empty', async () => {
    config.appSecret = APP_SECRET
    expect(await resolveSecret('@frigear-nu/x:key', 'own', 'legacy')).toBe('own')
    expect(await resolveSecret('@frigear-nu/x:key', '', 'legacy')).toBe('legacy')
    expect(await resolveSecret('@frigear-nu/x:key', '', undefined)).toBe('derived:@frigear-nu/x:key')
    delete config.appSecret
    expect(await resolveSecret('@frigear-nu/x:key', '')).toBe('')
  })
})
