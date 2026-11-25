import { describe, expect, it } from 'vitest'
import { appIdScheme, FALLBACK_APP_ID, resolveDesktopOptions, resolveSchemes } from '../../src/runtime/shared/config'
import { assertClientAuth, assertHandoffOpener, assertLocalAuth, desktopDependencies, localSecretNames, missingPluginWarnings, nativeLoaderTemplate } from '../../src/build'

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
      local: null,
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

  it('resolves local mode with its defaults', () => {
    const { options, errors, warnings } = resolveDesktopOptions({ appId: 'nu.frigear.Crew-Desk', mode: 'local' })
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(options.mode).toBe('local')
    // The bundled server renders the pages.
    expect(options.spa).toBe(false)
    expect(options.local).toEqual({ binaryName: 'crew-desk-server', port: 0, secureCookie: false, dataDirName: 'data' })
    expect(resolveDesktopOptions({ appId: 'a.b', mode: 'local', spa: true }).options.spa).toBe(true)
    expect(resolveDesktopOptions({ appId: 'a.b', local: { port: 4000 } }).options.local).toBeNull()
  })

  it('makes local mode with resource auth a SPA served by the bundled server', () => {
    const resource = (input: Parameters<typeof resolveDesktopOptions>[0]) => resolveDesktopOptions({ appId: 'a.b', ...input }, { authMode: 'resource' })
    expect(resource({ mode: 'local' }).options.spa).toBe(true)
    expect(resource({ mode: 'local' }).errors).toEqual([])
    // The issuer allows `http://127.0.0.1:*` for CORS, so the free port of every start needs no warning.
    expect(resource({ mode: 'local' }).warnings).toEqual([])
    expect(resource({ mode: 'local', local: { port: 47615 } }).warnings).toEqual([])
    expect(resolveDesktopOptions({ appId: 'a.b', mode: 'local' }, { authMode: 'server' }).warnings).toEqual([])
    expect(resolveDesktopOptions({ appId: 'a.b', mode: 'local' }, { authMode: 'server' }).options.spa).toBe(false)
    expect(resource({ mode: 'local', spa: false }).errors).toEqual([expect.stringMatching(/`spa: false`.*renders on the client only/)])
  })

  it('takes and checks the local options', () => {
    const { options } = resolveDesktopOptions({ appId: 'a.b', mode: 'local', local: { binaryName: 'srv', port: 4321, secureCookie: true, dataDirName: 'server' } })
    expect(options.local).toEqual({ binaryName: 'srv', port: 4321, secureCookie: true, dataDirName: 'server' })
    const { errors, warnings } = resolveDesktopOptions({ appId: 'a.b', mode: 'local', singleInstance: false, local: { binaryName: 'my server', port: 70000, dataDirName: '../up' } })
    expect(errors.join('\n')).toMatch(/`local.binaryName` "my server"/)
    expect(errors.join('\n')).toMatch(/`local.port`/)
    expect(errors.join('\n')).toMatch(/`local.dataDirName` "..\/up"/)
    expect(warnings).toEqual([expect.stringMatching(/second server on the same database/)])
    expect(resolveDesktopOptions({ appId: 'a.b', mode: 'local', local: { dataDirName: '..' } }).errors).toEqual([expect.stringMatching(/dataDirName/)])
  })

  it('rejects an unknown mode', () => {
    expect(resolveDesktopOptions({ appId: 'a.b', mode: 'cloud' as 'local' }).errors).toEqual([expect.stringMatching(/`mode` must be 'remote' or 'local'/)])
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
  it('requires client auth in remote mode', () => {
    expect(() => assertClientAuth('server')).toThrow(/runs in server mode.*authentication.mode: 'client'/)
    // Resource mode needs a server, which remote mode does not bundle.
    expect(() => assertClientAuth('resource')).toThrow(/runs in resource mode, which needs a server.*desktop.mode: 'local'/)
    expect(() => assertClientAuth('client')).not.toThrow()
  })

  it('takes server or resource auth in local mode, never client', () => {
    expect(() => assertLocalAuth('client')).toThrow(/client mode, which has no server half.*server is the default.*authentication.mode: 'resource'/s)
    expect(() => assertLocalAuth('server')).not.toThrow()
    expect(() => assertLocalAuth('resource')).not.toThrow()
  })

  it('asks Auth for the deep-link scheme in remote mode and local mode with resource auth', () => {
    const scheme = { client: { native: { scheme: 'nu.frigear.crew' } } }
    expect(desktopDependencies({ appId: 'nu.frigear.Crew', authConfigured: true, authMode: 'client' })['@frigear-nu/auth']).toEqual({ version: '>=0.0.1', defaults: scheme })
    expect(desktopDependencies({ appId: 'nu.frigear.crew', authConfigured: false, authMode: 'server' })['@frigear-nu/auth']).toBeUndefined()

    const resource = desktopDependencies({ mode: 'local', appId: 'nu.frigear.crew', authConfigured: true, authMode: 'resource' })
    expect(resource['@frigear-nu/auth']).toEqual({ version: '>=0.0.1', optional: false, defaults: scheme })
    // Sign-in is at the issuer: no offline sign-in defaults, no KV for throttling.
    expect(resource['@nuxthub/core']).toBeUndefined()
  })

  it('gives local mode with server auth its offline defaults, without a deep-link scheme', () => {
    const server = desktopDependencies({ mode: 'local', appId: 'nu.frigear.crew', authConfigured: true, authMode: 'server' })
    expect(server['@frigear-nu/auth']).toEqual({ version: '>=0.0.1', optional: false, defaults: { settings: { verifyEmail: false, trustRequestOrigin: true } } })
    expect(server['@nuxthub/core']).toEqual({ optional: true, defaults: { kv: true } })
    expect(desktopDependencies({ mode: 'local', authConfigured: false, authMode: 'server' })['@frigear-nu/auth']).toMatchObject({ optional: true })
  })

  it('generates the secrets each auth mode uses', () => {
    expect(localSecretNames({ authMode: null, oauthServer: false })).toEqual(['NUXT_APP_SECRET'])
    // Auth derives the key of kept OAuth tokens from NUXT_APP_SECRET: no NUXT_AUTH_TOKENS_KEY for a new installation.
    expect(localSecretNames({ authMode: 'server', oauthServer: false })).toEqual(['NUXT_APP_SECRET'])
    expect(localSecretNames({ authMode: 'server', oauthServer: true })).toEqual(['NUXT_APP_SECRET', 'NUXT_OAUTH_SERVER_PRIVATE_KEY'])
    // Resource mode signs nothing; Nuxt's own appSecret stays.
    expect(localSecretNames({ authMode: 'resource', oauthServer: true })).toEqual(['NUXT_APP_SECRET'])
  })

  it('imports only installed Tauri packages', () => {
    const source = nativeLoaderTemplate({ window: true, app: true, deepLink: true, opener: false, store: false, autostart: false, updater: false })
    expect(source).toContain('window: () => import("@tauri-apps/api/window"),')
    expect(source).toContain('app: () => import("@tauri-apps/api/app"),')
    expect(source).toContain('deepLink: () => import("@tauri-apps/plugin-deep-link"),')
    expect(source).toContain('opener: null,')
  })

  it('fails without the opener when the frigear handoff is on', () => {
    expect(() => assertHandoffOpener(pkg => pkg === '@tauri-apps/plugin-opener')).not.toThrow()
    expect(() => assertHandoffOpener(() => false)).toThrow(/`@tauri-apps\/plugin-opener`.*`pnpm add @tauri-apps\/plugin-opener`.*handoff: false/)
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
