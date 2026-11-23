import { describe, expect, it } from 'vitest'
import { capabilities, capabilityPermissions, mergeTauriConfig, resolveDesktopOptions, tauriConfig, usedPlugins } from '../../src/runtime/shared/config'

const resolved = (input: Parameters<typeof resolveDesktopOptions>[0] = {}) => resolveDesktopOptions({ appId: 'nu.frigear.crew', appName: 'Crew', ...input }, { packageVersion: '1.0.0' }).options

describe('tauriConfig', () => {
  it('writes the owned parts of tauri.conf.json', () => {
    expect(tauriConfig(resolved({ window: { minHeight: 500 } }), ['nu.frigear.crew', 'crew-auth'])).toEqual({
      productName: 'Crew',
      version: '1.0.0',
      identifier: 'nu.frigear.crew',
      build: { frontendDist: '../.output/public', devUrl: 'http://localhost:3000' },
      app: { windows: [{ label: 'main', title: 'Crew', width: 1280, height: 800, minHeight: 500, resizable: true, fullscreen: false, decorations: true, center: true }] },
      plugins: { 'deep-link': { desktop: { schemes: ['nu.frigear.crew', 'crew-auth'] } } },
      bundle: { active: true },
    })
  })

  it('adds the updater when configured', () => {
    const config = tauriConfig(resolved({ updater: { endpoints: ['https://u.example/{{target}}'], pubkey: 'KEY' } }))
    expect(config.plugins).toMatchObject({ updater: { endpoints: ['https://u.example/{{target}}'], pubkey: 'KEY' } })
    expect(config.bundle).toEqual({ active: true, createUpdaterArtifacts: true })
  })
})

describe('capabilities', () => {
  it('lists the permissions the features use', () => {
    expect(capabilityPermissions({ autostart: false, updater: false })).toEqual(expect.arrayContaining([
      'core:default', 'core:window:allow-set-focus', 'opener:default', 'deep-link:default', 'store:default',
    ]))
    expect(capabilityPermissions({ autostart: false, updater: false })).not.toContain('autostart:default')
    expect(capabilityPermissions({ autostart: true, updater: { endpoints: [], pubkey: '' } })).toEqual(expect.arrayContaining(['autostart:default', 'updater:default']))
  })

  it('applies to the main window on every desktop platform', () => {
    expect(capabilities({ autostart: false, updater: false })).toMatchObject({ identifier: 'frigear', windows: ['main'], platforms: ['macOS', 'windows', 'linux'] })
  })
})

describe('usedPlugins', () => {
  it('needs the opener and deep link to sign in', () => {
    expect(usedPlugins(resolved(), true).map(plugin => [plugin.name, plugin.required])).toEqual([
      ['@tauri-apps/api', true],
      ['@tauri-apps/plugin-deep-link', true],
      ['@tauri-apps/plugin-opener', true],
      ['@tauri-apps/plugin-store', false],
    ])
  })
  it('needs the store in local mode with a port picked on every start (localStorage follows the origin)', () => {
    const local = (port?: number) => usedPlugins(resolved({ mode: 'local', local: { port } }), true).find(plugin => plugin.name === '@tauri-apps/plugin-store')
    expect(local()).toMatchObject({ required: true, feature: expect.stringMatching(/port.*changes every start/) })
    expect(local(4000)).toMatchObject({ required: false })
  })
  it('adds autostart and the updater, and drops the deep link without schemes or sign-in', () => {
    const names = usedPlugins(resolved({ deepLinks: { schemes: false }, autostart: true, updater: { endpoints: ['https://u'], pubkey: 'k' } }), false).map(plugin => plugin.name)
    expect(names).toEqual(['@tauri-apps/api', '@tauri-apps/plugin-autostart', '@tauri-apps/plugin-updater', '@tauri-apps/plugin-opener'])
  })
})

describe('mergeTauriConfig', () => {
  const owned = tauriConfig(resolved())
  const existing = {
    $schema: 'https://schema.tauri.app/config/2',
    productName: 'Old name',
    build: { beforeDevCommand: 'pnpm dev', frontendDist: '../dist' },
    app: {
      security: { csp: 'default-src \'self\'' },
      windows: [{ label: 'main', title: 'Old', transparent: true }, { label: 'about', url: '/about' }],
    },
    plugins: { 'deep-link': { mobile: [{ host: 'app.example.com' }] }, 'shell': { open: true } },
    bundle: { icon: ['icons/icon.png'], targets: ['dmg'] },
  }

  it('overwrites the owned keys and keeps the others', () => {
    const merged = mergeTauriConfig(existing, owned)
    expect(merged).toMatchObject({
      $schema: 'https://schema.tauri.app/config/2',
      productName: 'Crew',
      identifier: 'nu.frigear.crew',
      build: { beforeDevCommand: 'pnpm dev', frontendDist: '../.output/public', devUrl: 'http://localhost:3000' },
      app: { security: { csp: 'default-src \'self\'' } },
      plugins: { 'deep-link': { mobile: [{ host: 'app.example.com' }], desktop: { schemes: ['nu.frigear.crew'] } }, 'shell': { open: true } },
      bundle: { active: true, icon: ['icons/icon.png'], targets: ['dmg'] },
    })
    const windows = (merged.app as { windows: Record<string, unknown>[] }).windows
    expect(windows).toHaveLength(2)
    expect(windows[0]).toMatchObject({ label: 'main', title: 'Crew', transparent: true, width: 1280 })
    expect(windows[1]).toEqual({ label: 'about', url: '/about' })
  })

  it('is idempotent', () => {
    const once = mergeTauriConfig(existing, owned)
    expect(mergeTauriConfig(once, owned)).toEqual(once)
    expect(JSON.stringify(mergeTauriConfig(once, owned))).toBe(JSON.stringify(once))
  })

  it('treats an unlabelled window as the main one, and adds one when there is none', () => {
    const unlabelled = mergeTauriConfig({ app: { windows: [{ title: 'x', focus: false }] } }, owned)
    expect((unlabelled.app as { windows: unknown[] }).windows).toEqual([expect.objectContaining({ label: 'main', focus: false, title: 'Crew' })])
    const none = mergeTauriConfig({ app: { windows: [{ label: 'splash' }] } }, owned)
    expect((none.app as { windows: { label: string }[] }).windows.map(window => window.label)).toEqual(['main', 'splash'])
  })

  it('does not change its inputs', () => {
    const copy = structuredClone(existing)
    mergeTauriConfig(existing, owned)
    expect(existing).toEqual(copy)
  })
})
