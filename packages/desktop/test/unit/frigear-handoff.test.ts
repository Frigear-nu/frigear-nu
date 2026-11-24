import { describe, expect, it } from 'vitest'
import { desktopDependencies, frigearHandoffDefaults, HANDOFF_RETURN_PATH, handoffReturnUrl } from '../../src/build'
import { capabilities, resolveDesktopOptions, resolveSchemes, tauriConfig, usedPlugins } from '../../src/runtime/shared/config'
import { classifyDeepLink } from '../../src/runtime/shared/deep-links'

// Local mode with server auth: "Log in with frigear.nu" in the system browser (Auth's `oauth.frigear.handoff`).

const local = resolveDesktopOptions({ appId: 'nu.frigear.desk', mode: 'local' }).options
const deps = (frigear: unknown, input: Partial<Parameters<typeof desktopDependencies>[0]> = {}) =>
  desktopDependencies({ mode: 'local', appId: 'nu.frigear.desk', authConfigured: true, authMode: 'server', frigear, ...input })['@frigear-nu/auth']

describe('handoff defaults', () => {
  const on = { settings: { oauth: { frigear: { handoff: true } } } }

  it('turns the handoff on where the app enables the frigear provider', () => {
    // `true` would win over a default object (defu), so it is an override: the same provider, with the handoff.
    expect(frigearHandoffDefaults(true)).toEqual({ overrides: on })
    expect(frigearHandoffDefaults({ label: 'Frigear' })).toEqual({ defaults: on })
  })

  it('never enables the provider, and leaves an explicit handoff alone', () => {
    // Any key under `settings.oauth` enables a provider: no default may add one.
    expect(frigearHandoffDefaults(undefined)).toEqual({})
    expect(frigearHandoffDefaults(false)).toEqual({})
    expect(frigearHandoffDefaults({ handoff: false })).toEqual({})
    expect(frigearHandoffDefaults({ handoff: true })).toEqual({})
  })

  it('merges into the offline defaults of local mode with server auth', () => {
    expect(deps({ keepTokens: true })).toEqual({
      version: '>=0.0.1',
      optional: false,
      defaults: { settings: { verifyEmail: false, trustRequestOrigin: true, oauth: { frigear: { handoff: true } } } },
    })
    expect(deps(true)).toMatchObject({ defaults: { settings: { verifyEmail: false, trustRequestOrigin: true } }, overrides: on })
    expect(deps(undefined)).not.toHaveProperty('overrides')
    expect(deps(undefined)!.defaults).toEqual({ settings: { verifyEmail: false, trustRequestOrigin: true } })
  })

  it('does not touch remote mode or local mode with resource auth', () => {
    expect(deps(true, { authMode: 'resource' })).toEqual({ version: '>=0.0.1', optional: false, defaults: { client: { native: { scheme: 'nu.frigear.desk' } } } })
    expect(deps(true, { mode: 'remote', authMode: 'client' })).toEqual({ version: '>=0.0.1', defaults: { client: { native: { scheme: 'nu.frigear.desk' } } } })
  })
})

describe('handoff return link', () => {
  it('is the app id\'s scheme, else the first deep-link scheme, else none', () => {
    expect(handoffReturnUrl('nu.frigear.desk', local.deepLinks.schemes)).toBe('nu.frigear.desk:/auth/return')
    expect(handoffReturnUrl('nu.frigear.desk', ['desk', 'other'])).toBe('desk:/auth/return')
    expect(handoffReturnUrl('nu.frigear.desk', [])).toBeUndefined()
  })

  it('is registered as a deep-link scheme in local mode', () => {
    expect(tauriConfig(local, resolveSchemes('', local.deepLinks.schemes)).plugins).toEqual({ 'deep-link': { desktop: { schemes: ['nu.frigear.desk'] } } })
  })

  it('only focuses the window, whatever it carries', () => {
    const options = { schemes: ['nu.frigear.desk'], focusPath: HANDOFF_RETURN_PATH }
    expect(classifyDeepLink('nu.frigear.desk:/auth/return', options)).toEqual({ type: 'focus' })
    expect(classifyDeepLink('nu.frigear.desk://auth/return?code=x#y', options)).toEqual({ type: 'focus' })
    expect(classifyDeepLink('nu.frigear.desk:/auth/return/more', options)).toEqual({ type: 'route', path: '/auth/return/more' })
    // Without a focus path (remote mode, resource auth) it is an ordinary route.
    expect(classifyDeepLink('nu.frigear.desk:/auth/return', { schemes: ['nu.frigear.desk'] })).toEqual({ type: 'route', path: '/auth/return' })
    expect(classifyDeepLink('other:/auth/return', options)).toEqual({ type: 'ignore', reason: 'unknown-scheme' })
  })
})

describe('handoff plugins and capability', () => {
  it('requires the opener and the deep link', () => {
    const plugins = usedPlugins(local, false, true)
    expect(plugins.find(plugin => plugin.name === '@tauri-apps/plugin-opener')).toMatchObject({ required: true, feature: expect.stringContaining('frigear.nu') })
    expect(plugins.find(plugin => plugin.name === '@tauri-apps/plugin-deep-link')).toMatchObject({ required: true })
    // No tokens in the window: the session is a cookie, so no store.
    expect(plugins.some(plugin => plugin.name === '@tauri-apps/plugin-store')).toBe(false)
    const noSchemes = resolveDesktopOptions({ appId: 'nu.frigear.desk', mode: 'local', deepLinks: { schemes: false } }).options
    expect(usedPlugins(noSchemes, false, true).find(plugin => plugin.name === '@tauri-apps/plugin-deep-link')).toMatchObject({ required: true })
    expect(usedPlugins(local, false, false).find(plugin => plugin.name === '@tauri-apps/plugin-opener')).toMatchObject({ required: false })
  })

  it('grants the bundled server\'s pages the opener, deep link and focus', () => {
    const capability = capabilities(local)
    expect(capability.remote).toEqual({ urls: ['http://127.0.0.1:*'] })
    expect(capability.permissions).toEqual(expect.arrayContaining(['opener:default', 'deep-link:default', 'core:window:allow-set-focus']))
  })
})

describe('session cookie', () => {
  it('drops `Secure` by default in local mode (WKWebView and WebKitGTK refuse it on http://127.0.0.1)', () => {
    expect(local.local?.secureCookie).toBe(false)
    expect(resolveDesktopOptions({ appId: 'nu.frigear.desk', mode: 'local', local: { secureCookie: true } }).options.local?.secureCookie).toBe(true)
  })
})
