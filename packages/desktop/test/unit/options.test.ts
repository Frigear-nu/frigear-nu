import { describe, expect, it } from 'vitest'
import { appIdScheme, FALLBACK_APP_ID, resolveDesktopOptions, resolveSchemes } from '../../src/runtime/shared/config'
import { assertClientAuth, missingPluginWarnings, nativeLoaderTemplate } from '../../src/build'

describe('resolveDesktopOptions', () => {
  it('fills in the defaults', () => {
    const { options, errors, warnings } = resolveDesktopOptions({ appId: 'nu.frigear.Crew' }, { packageVersion: '1.4.0' })
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(options).toEqual({
      appId: 'nu.frigear.Crew',
      appName: 'nu.frigear.Crew',
      version: '1.4.0',
      mode: 'remote',
      spa: true,
      window: { title: 'nu.frigear.Crew', width: 1280, height: 800, resizable: true, fullscreen: false, decorations: true, center: true },
      deepLinks: { schemes: ['nu.frigear.crew'] },
      singleInstance: true,
      autostart: false,
      updater: false,
      devUrl: 'http://localhost:3000',
    })
  })

  it('takes the options', () => {
    const { options, errors } = resolveDesktopOptions({
      appId: 'nu.frigear.crew',
      appName: 'Crew',
      version: '2.0.0-beta.1',
      spa: false,
      window: { width: 1024, minWidth: 640, decorations: false },
      deepLinks: { schemes: ['Crew', 'crew'] },
      singleInstance: false,
      autostart: true,
      updater: { endpoints: ['https://example.com/{{target}}/{{current_version}}'], pubkey: ' KEY ' },
      devUrl: 'http://localhost:4000',
    })
    expect(errors).toEqual([])
    expect(options).toMatchObject({
      appName: 'Crew',
      version: '2.0.0-beta.1',
      spa: false,
      window: { title: 'Crew', width: 1024, minWidth: 640, decorations: false },
      deepLinks: { schemes: ['crew'] },
      singleInstance: false,
      autostart: true,
      updater: { pubkey: 'KEY' },
      devUrl: 'http://localhost:4000',
    })
  })

  it('makes a kiosk window fullscreen, undecorated and fixed', () => {
    const { options } = resolveDesktopOptions({ appId: 'nu.frigear.desk', window: { kiosk: true, resizable: true } })
    expect(options.window).toMatchObject({ fullscreen: true, decorations: false, resizable: false })
  })

  it('takes the dev port and ignores a version that is not semver', () => {
    const { options } = resolveDesktopOptions({ appId: 'a.b' }, { devPort: 3100, packageVersion: 'next' })
    expect(options.devUrl).toBe('http://localhost:3100')
    expect(options.version).toBe('0.1.0')
  })

  it('turns deep links off', () => {
    expect(resolveDesktopOptions({ appId: 'a.b', deepLinks: { schemes: false } }).options.deepLinks.schemes).toEqual([])
  })

  it('throws for local mode', () => {
    expect(() => resolveDesktopOptions({ appId: 'a.b', mode: 'local' })).toThrow(/not implemented yet/)
  })

  it('requires the app id, except while preparing', () => {
    expect(resolveDesktopOptions({}).errors).toEqual([expect.stringMatching(/`appId` is required/)])
    const prepared = resolveDesktopOptions({}, { prepare: true })
    expect(prepared.errors).toEqual([])
    expect(prepared.options.appId).toBe(FALLBACK_APP_ID)
  })

  it('reports invalid options', () => {
    const { errors } = resolveDesktopOptions({
      appId: 'my_app',
      version: 'v1',
      window: { width: 0 },
      deepLinks: { schemes: ['https', '1bad'] },
      updater: { endpoints: ['http://insecure'], pubkey: '' },
      devUrl: 'localhost:3000',
    })
    expect(errors.join('\n')).toMatch(/`appId` "my_app"/)
    expect(errors.join('\n')).toMatch(/`version` "v1"/)
    expect(errors.join('\n')).toMatch(/`window.width`/)
    expect(errors.join('\n')).toMatch(/"https" cannot be a deep-link scheme/)
    expect(errors.join('\n')).toMatch(/"1bad" is not a URL scheme/)
    expect(errors.join('\n')).toMatch(/must be an https URL/)
    expect(errors.join('\n')).toMatch(/`updater.pubkey` is required/)
    expect(errors.join('\n')).toMatch(/`devUrl`/)
  })

  it('warns about an app id ending in .app', () => {
    expect(resolveDesktopOptions({ appId: 'nu.frigear.app' }).warnings).toEqual([expect.stringMatching(/macOS bundle extension/)])
  })
})

describe('schemes', () => {
  it('derives the scheme from the app id', () => {
    expect(appIdScheme('nu.My_Company.App')).toBe('nu.my-company.app')
    expect(appIdScheme('1.bad')).toBeUndefined()
  })
  it('adds the redirect URI scheme, not http(s)', () => {
    expect(resolveSchemes('nu.frigear.auth:/auth/callback', ['nu.frigear.crew'])).toEqual(['nu.frigear.auth', 'nu.frigear.crew'])
    expect(resolveSchemes('http://127.0.0.1/auth/callback', ['crew'])).toEqual(['crew'])
    expect(resolveSchemes('', [])).toEqual([])
  })
})

describe('module rules', () => {
  it('requires client auth', () => {
    expect(() => assertClientAuth('server')).toThrow(/authentication.mode: 'client'/)
    expect(() => assertClientAuth('client')).not.toThrow()
  })

  it('imports only installed Tauri packages', () => {
    const source = nativeLoaderTemplate({ window: true, app: true, deepLink: true, opener: false, store: false, autostart: false, updater: false })
    expect(source).toContain('window: () => import("@tauri-apps/api/window"),')
    expect(source).toContain('app: () => import("@tauri-apps/api/app"),')
    expect(source).toContain('deepLink: () => import("@tauri-apps/plugin-deep-link"),')
    expect(source).toContain('opener: null,')
  })

  it('warns about missing packages', () => {
    const warnings = missingPluginWarnings([
      { name: '@tauri-apps/plugin-opener', required: true, feature: 'sign-in' },
      { name: '@tauri-apps/plugin-store', required: false, feature: 'tokens' },
      { name: '@tauri-apps/api', required: true, feature: 'window' },
    ], pkg => pkg === '@tauri-apps/api')
    expect(warnings).toEqual([
      '`@tauri-apps/plugin-opener` is not installed (sign-in): `pnpm add @tauri-apps/plugin-opener`.',
      '`@tauri-apps/plugin-store` is not installed (tokens), optional: `pnpm add @tauri-apps/plugin-store`.',
    ])
  })
})
