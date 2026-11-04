import { describe, expect, it } from 'vitest'
import { appIdScheme, nativeLoaderTemplate, pickLanAddress, resolveDeepLinks, resolveLanHost, resolveSchemes, tabsTemplate, usedPlugins } from '../../src/build'

const iface = (address: string, internal = false) => ({ address, family: 'IPv4' as const, internal, netmask: '', mac: '', cidr: null })

describe('LAN host', () => {
  const interfaces = () => ({ lo0: [iface('127.0.0.1', true)], utun3: [iface('10.8.0.2')], en0: [iface('192.168.1.20')] })

  it('picks the Wi-Fi / Ethernet private address', () => {
    expect(pickLanAddress(interfaces())).toBe('192.168.1.20')
    expect(pickLanAddress({ en0: [iface('8.8.8.8')] })).toBeUndefined()
  })

  it('only applies to MOBILE_LAN builds, never in dev or release builds', () => {
    expect(resolveLanHost({ dev: false, option: true, env: {}, interfaces })).toBeUndefined()
    expect(resolveLanHost({ dev: true, option: true, env: { MOBILE_LAN: '1' }, interfaces })).toBeUndefined()
    expect(resolveLanHost({ dev: false, option: false, env: { MOBILE_LAN: '1' }, interfaces })).toBeUndefined()
    expect(resolveLanHost({ dev: false, option: true, env: { MOBILE_LAN: '1' }, interfaces })).toBe('192.168.1.20')
    expect(resolveLanHost({ dev: false, option: '10.0.0.5', env: { MOBILE_LAN: 'true' }, interfaces })).toBe('10.0.0.5')
    expect(resolveLanHost({ dev: false, option: true, env: { MOBILE_LAN: '192.168.1.99' }, interfaces })).toBe('192.168.1.99')
    expect(() => resolveLanHost({ dev: false, option: true, env: { MOBILE_LAN: '1', MOBILE_RELEASE: '1' }, interfaces })).toThrow(/release build/)
    expect(() => resolveLanHost({ dev: false, option: true, env: { MOBILE_LAN: '1' }, interfaces: () => ({}) })).toThrow(/no LAN address/)
  })
})

describe('templates', () => {
  it('imports only installed native plugins', () => {
    const source = nativeLoaderTemplate({ app: true, haptics: false, actionSheet: false, dialog: false, share: false, statusBar: false, keyboard: false, nativeNavigation: true }, '/abs/native')
    expect(source).toContain('import { withoutThen } from "/abs/native"')
    expect(source).toContain('app: () => import("@capacitor/app").then(m => withoutThen(m.App)),')
    expect(source).toContain('haptics: null,')
    expect(source).toContain('nativeNavigation: () => import("@capgo/capacitor-native-navigation").then(m => withoutThen(m.NativeNavigation)),')
  })

  it('serializes the tabs', () => {
    expect(tabsTemplate([{ id: 'a', to: '/', label: 'A', icon: 'i', match: ['/'], requiresAuth: false }])).toMatch(/^export const tabs = \[/)
  })
})

describe('resolveSchemes', () => {
  it('takes the redirect URI scheme and the deep-link schemes, lowercase and unique', () => {
    expect(resolveSchemes('nu.frigear.app:/auth/callback', ['NU.Frigear.App', 'frigear'])).toEqual(['nu.frigear.app', 'frigear'])
    expect(resolveSchemes('https://app.example.com/auth/callback', [])).toEqual([])
    expect(resolveSchemes('', ['x'])).toEqual(['x'])
  })
})

describe('usedPlugins', () => {
  it('lists the plugins of enabled features, required ones marked', () => {
    const names = (input: Parameters<typeof usedPlugins>[0]) => usedPlugins(input).map(plugin => `${plugin.name}${plugin.required ? '!' : ''}`)
    expect(names({ nativeChrome: false, statusBar: false, keyboardAccessoryBar: false, oauth: false }))
      .toEqual(['@capacitor/core!', '@capacitor/app!', '@capacitor/haptics', '@capacitor/action-sheet', '@capacitor/dialog', '@capacitor/share'])
    expect(names({ nativeChrome: true, statusBar: true, keyboardAccessoryBar: true, oauth: true }))
      .toEqual(expect.arrayContaining(['@capacitor/status-bar', '@capacitor/keyboard', '@capgo/capacitor-native-navigation', '@capacitor/browser!', '@aparajita/capacitor-secure-storage']))
  })
})

describe('deep-link schemes and hosts', () => {
  it('makes a URL scheme of the app id', () => {
    expect(appIdScheme('nu.frigear.App')).toBe('nu.frigear.app')
    expect(appIdScheme('com.my_company.app')).toBe('com.my-company.app')
    expect(appIdScheme('1password.app')).toBeUndefined()
  })

  it('defaults to the app id scheme, lowercases and dedupes', () => {
    expect(resolveDeepLinks({ appId: 'com.my_company.App' })).toEqual({ schemes: ['com.my-company.app'], hosts: [], errors: [] })
    expect(resolveDeepLinks({ appId: 'a.b', schemes: ['X.Y', 'x.y'], hosts: ['App.Example.com'] }))
      .toEqual({ schemes: ['x.y'], hosts: ['app.example.com'], errors: [] })
    expect(resolveDeepLinks({ appId: 'a.b', schemes: false }).schemes).toEqual([])
  })

  it('rejects what cannot go into Info.plist / AndroidManifest.xml', () => {
    const { errors } = resolveDeepLinks({ appId: 'a.b', schemes: ['my_app', 'https', 'a"b'], hosts: ['https://app.example.com', 'app.example.com/x', 'a"b'] })
    expect(errors).toHaveLength(6)
  })
})
