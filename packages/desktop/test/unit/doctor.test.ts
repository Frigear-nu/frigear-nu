import { describe, expect, it } from 'vitest'
import type { DesktopManifest } from '../../src/types'
import { resolveBun, resolveCargo, runDoctor, type DoctorInput } from '../../src/runtime/cli/doctor'
import { cargoToml } from '../../src/runtime/cli/templates'

const manifest: DesktopManifest = {
  appId: 'nu.frigear.crew', appName: 'Crew', version: '1.0.0', mode: 'remote', devUrl: 'http://localhost:3000', redirectUri: '',
  schemes: ['nu.frigear.crew'], singleInstance: true, autostart: false, updater: false, local: null,
  plugins: [
    { name: '@tauri-apps/plugin-opener', required: true, feature: 'sign-in' },
    { name: '@tauri-apps/plugin-store', required: false, feature: 'tokens' },
  ],
}

const input = (overrides: Partial<DoctorInput> = {}): DoctorInput => ({
  platform: 'darwin',
  exec: () => ({ ok: true, stdout: '' }),
  isInstalled: () => true,
  readFile: path => ({ 'src-tauri/tauri.conf.json': '{}', 'src-tauri/Cargo.toml': cargoToml(manifest) } as Record<string, string>)[path] ?? null,
  manifest,
  ...overrides,
})

const messages = (findings: { level: string, message: string }[], level: string) => findings.filter(finding => finding.level === level).map(finding => finding.message)

describe('runDoctor', () => {
  it('passes a ready machine and app', () => {
    expect(runDoctor(input())).toEqual([])
  })

  it('finds a missing Rust toolchain and Tauri CLI', () => {
    const errors = messages(runDoctor(input({
      exec: command => ({ ok: command !== 'cargo' && command !== 'rustc', stdout: '' }),
      isInstalled: pkg => pkg !== '@tauri-apps/cli',
    })), 'error')
    expect(errors).toEqual([
      expect.stringMatching(/`cargo` was not found: run `frigear-desktop doctor --fix`, or install Rust with `curl/),
      expect.stringMatching(/pnpm add -D @tauri-apps\/cli/),
    ])
  })

  it('marks what --fix can fix', () => {
    const findings = runDoctor(input({
      exec: command => ({ ok: command !== 'cargo' && command !== 'xcode-select', stdout: '' }),
      isInstalled: pkg => pkg !== '@tauri-apps/cli' && pkg !== '@tauri-apps/plugin-opener',
      readFile: () => null,
    }))
    expect(findings.map(finding => finding.fix)).toEqual([
      { kind: 'rust' },
      { kind: 'packages', names: ['@tauri-apps/cli'], dev: true },
      { kind: 'xcode' },
      { kind: 'init' },
      { kind: 'packages', names: ['@tauri-apps/plugin-opener'], dev: false },
    ])
    // Windows needs the GUI installer: nothing to run.
    expect(runDoctor(input({ platform: 'win32', exec: () => ({ ok: false, stdout: '' }) }))[0]!.fix).toBeUndefined()
  })

  it('finds Rust in ~/.cargo/bin when the terminal does not have it on the PATH yet', () => {
    const exec = (command: string) => ({ ok: command.startsWith('/home/me/.cargo/bin/') || (command !== 'cargo' && command !== 'rustc'), stdout: '' })
    expect(resolveCargo({ HOME: '/home/me' }, exec, 'linux')).toBe('/home/me/.cargo/bin')
    expect(resolveCargo({ HOME: '/home/me', CARGO_HOME: '/opt/cargo' }, command => ({ ok: command === '/opt/cargo/bin/cargo', stdout: '' }), 'linux')).toBe('/opt/cargo/bin')
    expect(resolveCargo({}, () => ({ ok: false, stdout: '' }), 'linux')).toBeNull()
    const findings = runDoctor(input({ platform: 'linux', env: { HOME: '/home/me' }, exec: command => (command === 'pkg-config' ? { ok: true, stdout: '' } : exec(command)) }))
    expect(messages(findings, 'error')).toEqual([])
    expect(messages(findings, 'info')).toEqual([expect.stringMatching(/Rust is installed in \/home\/me\/.cargo\/bin/)])
  })

  it('finds Bun in BUN, on the PATH, or where bun.sh installed it', () => {
    const only = (path: string) => (command: string) => ({ ok: command === path, stdout: '' })
    expect(resolveBun({ HOME: '/home/me' }, only('bun'), 'linux')).toBe('bun')
    expect(resolveBun({ HOME: '/home/me' }, only('/home/me/.bun/bin/bun'), 'linux')).toBe('/home/me/.bun/bin/bun')
    expect(resolveBun({ HOME: '/home/me', BUN_INSTALL: '/opt/bun' }, only('/opt/bun/bin/bun'), 'linux')).toBe('/opt/bun/bin/bun')
    expect(resolveBun({ BUN: '/x/bun' }, only('bun'), 'linux')).toBeNull()
    expect(resolveBun({}, only('/home/me/.bun/bin/bun'), 'linux')).toBeNull()
  })

  it('checks the Xcode Command Line Tools on macOS', () => {
    const findings = runDoctor(input({ exec: command => ({ ok: command !== 'xcode-select', stdout: '' }) }))
    expect(messages(findings, 'error')).toEqual([expect.stringMatching(/xcode-select --install/)])
  })

  it('checks WebKitGTK 4.1 on Linux', () => {
    const calls: string[] = []
    const findings = runDoctor(input({
      platform: 'linux',
      exec: (command, args) => {
        calls.push([command, ...args].join(' '))
        return { ok: !args.includes('webkit2gtk-4.1'), stdout: '' }
      },
    }))
    expect(calls).toContain('pkg-config --exists webkit2gtk-4.1')
    expect(messages(findings, 'error')).toEqual([expect.stringMatching(/libwebkit2gtk-4\.1-dev/)])
    expect(messages(runDoctor(input({ platform: 'linux', exec: command => ({ ok: command !== 'pkg-config', stdout: '' }) })), 'error'))
      .toEqual([expect.stringMatching(/`pkg-config` was not found/)])
  })

  it('notes WebView2 on Windows', () => {
    const findings = runDoctor(input({ platform: 'win32' }))
    expect(messages(findings, 'info')).toEqual([expect.stringMatching(/WebView2/)])
    expect(messages(runDoctor(input({ platform: 'win32', exec: () => ({ ok: false, stdout: '' }) })), 'error')[0]).toMatch(/rustup\.rs/)
  })

  it('checks the project and the app\'s Tauri packages', () => {
    const findings = runDoctor(input({
      manifest: { ...manifest, autostart: true },
      readFile: path => (path === 'src-tauri/Cargo.toml' ? '[dependencies]\ntauri = "2"\n' : null),
      isInstalled: pkg => pkg === '@tauri-apps/cli',
    }))
    expect(messages(findings, 'warning')).toEqual([
      expect.stringMatching(/tauri.conf.json does not exist: run `frigear-desktop init`/),
      expect.stringMatching(/tauri-plugin-single-instance/),
    ])
    expect(messages(findings, 'error')).toEqual([
      expect.stringMatching(/tauri-plugin-autostart/),
      expect.stringMatching(/`@tauri-apps\/plugin-opener` is not installed/),
    ])
    expect(messages(findings, 'info')).toEqual([expect.stringMatching(/`@tauri-apps\/plugin-store` is not installed/)])
  })

  it('says how to check the packages without a prepared app', () => {
    expect(messages(runDoctor(input({ manifest: null })), 'info')).toEqual([expect.stringMatching(/nuxt prepare/)])
  })
})
