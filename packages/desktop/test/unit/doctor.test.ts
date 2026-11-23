import { describe, expect, it } from 'vitest'
import type { DesktopManifest } from '../../src/types'
import { runDoctor, type DoctorInput } from '../../src/runtime/cli/doctor'
import { cargoToml } from '../../src/runtime/cli/templates'

const manifest: DesktopManifest = {
  appId: 'nu.frigear.crew', appName: 'Crew', version: '1.0.0', mode: 'remote', devUrl: 'http://localhost:3000', redirectUri: '',
  schemes: ['nu.frigear.crew'], singleInstance: true, autostart: false, updater: false,
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
      expect.stringMatching(/`cargo` was not found: install Rust: `curl/),
      expect.stringMatching(/`rustc` was not found/),
      expect.stringMatching(/pnpm add -D @tauri-apps\/cli/),
    ])
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
