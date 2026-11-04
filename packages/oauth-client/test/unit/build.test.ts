import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertNoClientSecretInBundle,
  checkNativeStorage,
  isPackageInstalled,
  nativeLoaderTemplate,
  parseStorageOption,
  resolveNativeRedirectUri,
} from '../../src/build'

describe('resolveNativeRedirectUri', () => {
  it('derives a lowercase custom-scheme redirect URI from the app id', () => {
    expect(resolveNativeRedirectUri({ scheme: 'nu.Frigear.App', callbackPath: '/auth/callback' })).toBe('nu.frigear.app:/auth/callback')
    expect(resolveNativeRedirectUri({ scheme: 'app', callbackPath: 'oauth' })).toBe('app:/oauth')
  })

  it('keeps an explicit redirect URI and has none without a scheme', () => {
    expect(resolveNativeRedirectUri({ scheme: 'ignored', redirectUri: 'https://app.example/auth', callbackPath: '/x' })).toBe('https://app.example/auth')
    expect(resolveNativeRedirectUri({ callbackPath: '/auth/callback' })).toBeUndefined()
  })

  it.each(['com.example_app', '1password', 'my app', 'ø.app'])('rejects the scheme %s', (scheme) => {
    expect(() => resolveNativeRedirectUri({ scheme, callbackPath: '/auth/callback' })).toThrow(/not a valid URL scheme/)
  })

  it('rejects a relative native redirect URI', () => {
    expect(() => resolveNativeRedirectUri({ redirectUri: '/auth/callback', callbackPath: '/auth/callback' })).toThrow(/absolute/)
  })
})

describe('assertNoClientSecretInBundle', () => {
  const base = { dev: false, prepare: false, allow: false, env: {} }

  it('fails a production build with a client secret in the environment or config', () => {
    expect(() => assertNoClientSecretInBundle({ ...base, env: { NUXT_PUBLIC_OAUTH_CLIENT_SECRET: 's' } })).toThrow(/NUXT_PUBLIC_OAUTH_CLIENT_SECRET/)
    expect(() => assertNoClientSecretInBundle({ ...base, env: { NUXT_PUBLIC_OAUTH_CLIENT_CLIENT_SECRET: 's' } })).toThrow(/CLIENT_CLIENT_SECRET/)
    expect(() => assertNoClientSecretInBundle({ ...base, configured: 's' })).toThrow(/runtimeConfig/)
  })

  it('allows dev, prepare, an explicit opt-in and builds without a secret', () => {
    const env = { NUXT_PUBLIC_OAUTH_CLIENT_SECRET: 's' }
    expect(() => assertNoClientSecretInBundle({ ...base, env, dev: true })).not.toThrow()
    expect(() => assertNoClientSecretInBundle({ ...base, env, prepare: true })).not.toThrow()
    expect(() => assertNoClientSecretInBundle({ ...base, env, allow: true })).not.toThrow()
    expect(() => assertNoClientSecretInBundle(base)).not.toThrow()
  })
})

describe('checkNativeStorage', () => {
  const base = { mode: 'auto' as const, dev: false, prepare: false, capacitor: true, secureStorage: false, preferences: true }

  it('fails a native production build that would keep tokens unencrypted', () => {
    expect(() => checkNativeStorage(base)).toThrow(/capacitor-secure-storage/)
    expect(() => checkNativeStorage({ ...base, mode: 'secure' })).toThrow(/'secure'/)
  })

  it('only warns in development, and accepts an explicit choice', () => {
    expect(checkNativeStorage({ ...base, dev: true }).warning).toMatch(/preferences/)
    expect(checkNativeStorage({ ...base, mode: 'preferences' })).toEqual({})
    expect(checkNativeStorage({ ...base, secureStorage: true })).toEqual({})
    expect(checkNativeStorage({ ...base, capacitor: false })).toEqual({})
  })
})

describe('parseStorageOption', () => {
  it('recognises the modes and treats anything else as a file', () => {
    expect(parseStorageOption(undefined)).toEqual({ mode: 'auto' })
    expect(parseStorageOption('session')).toEqual({ mode: 'session' })
    expect(parseStorageOption('./app/token-storage')).toEqual({ mode: 'custom', file: './app/token-storage' })
  })
})

describe('isPackageInstalled', () => {
  it('finds packages in the app or a parent node_modules', () => {
    const root = mkdtempSync(join(tmpdir(), 'oauth-client-'))
    mkdirSync(join(root, 'node_modules/@capacitor/app'), { recursive: true })
    writeFileSync(join(root, 'node_modules/@capacitor/app/package.json'), '{}')
    mkdirSync(join(root, 'apps/mobile'), { recursive: true })
    expect(isPackageInstalled('@capacitor/app', join(root, 'apps/mobile'))).toBe(true)
    expect(isPackageInstalled('@capacitor/browser', join(root, 'apps/mobile'))).toBe(false)
  })
})

describe('nativeLoaderTemplate', () => {
  it('imports only the installed plugins', () => {
    const source = nativeLoaderTemplate({ installed: { app: true, browser: false, preferences: true, secureStorage: false }, customStorage: '/abs/storage.ts', helper: '/abs/adapters' })
    expect(source).toContain('import { withoutThen } from "/abs/adapters"')
    expect(source).toContain('app: () => import("@capacitor/app").then(m => withoutThen(m.App))')
    expect(source).toContain('browser: null')
    expect(source).toContain('secureStorage: null')
    expect(source).not.toContain('@capacitor/browser')
    expect(source).toContain('import("/abs/storage.ts")')
  })
})

describe('mergePublicConfig', () => {
  it('lets lists the host sets replace the module\'s instead of being appended', async () => {
    const { mergePublicConfig } = await import('../../src/build')
    const defaults = {
      issuer: 'https://id.test', clientId: 'app', scope: 'openid', apiBase: '', redirectUri: '', nativeRedirectUri: '',
      callbackPath: '/auth/callback', discovery: true, endpoints: {}, authorizationParams: {}, storage: 'auto' as const,
      protect: 'all' as const, publicPaths: ['/about'], redirect: { login: '/login', afterLogin: '/', afterLogout: '/login' },
      api: { attachTo: ['https://api.test'], onUnauthorized: 'signOut' as const }, rewriteLoopback: true,
    }
    const merged = mergePublicConfig({ publicPaths: ['/docs/**'], api: { attachTo: ['https://other.test'], onUnauthorized: 'none' }, clientId: 'host' }, defaults)
    expect(merged.publicPaths).toEqual(['/docs/**'])
    expect(merged.api).toEqual({ attachTo: ['https://other.test'], onUnauthorized: 'none' })
    expect(merged.clientId).toBe('host')
    expect(merged.issuer).toBe('https://id.test')
    expect(mergePublicConfig(undefined, defaults).publicPaths).toEqual(['/about'])
  })
})
