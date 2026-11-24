import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopManifest } from '../../src/types'
import { init, initFiles, main, parseArgs, syncProject, type Io } from '../../src/runtime/cli/main'
import { capabilities, resolveDesktopOptions, tauriConfig } from '../../src/runtime/shared/config'
import { cargoToml, crateName, libName, libRs, mainRs } from '../../src/runtime/cli/templates'
import { pngIco, solidPng } from '../../src/runtime/cli/icon'

const options = resolveDesktopOptions({ appId: 'nu.frigear.crew', appName: 'Crew' }, { packageVersion: '1.0.0' }).options
const manifest: DesktopManifest = {
  appId: 'nu.frigear.crew', appName: 'Crew', version: '1.0.0', mode: 'remote', devUrl: 'http://localhost:3000',
  redirectUri: 'nu.frigear.crew:/auth/callback', schemes: ['nu.frigear.crew'], singleInstance: true, autostart: false,
  updater: false, plugins: [{ name: '@tauri-apps/api', required: true, feature: 'window' }], local: null,
}
const generated = { config: tauriConfig(options), capabilities: capabilities(options), manifest }

describe('parseArgs', () => {
  it('parses commands and options', () => {
    expect(parseArgs(['init', '--force', '--cwd', '/tmp/app'])).toEqual({ command: 'init', force: true, cwd: '/tmp/app', passthrough: [] })
    expect(parseArgs(['build', '--cwd=/tmp/a=b', '--', '--debug', '--bundles', 'dmg'])).toEqual({ command: 'build', force: false, cwd: '/tmp/a=b', passthrough: ['--debug', '--bundles', 'dmg'] })
    expect(parseArgs([])).toMatchObject({ command: 'help' })
    expect(parseArgs(['--help'])).toMatchObject({ command: 'help' })
  })
  it('rejects unknown or misplaced input', () => {
    expect(() => parseArgs(['deploy'])).toThrow(/Unknown command/)
    expect(() => parseArgs(['sync', '--verbose'])).toThrow(/Unknown option/)
    expect(() => parseArgs(['sync', '--force'])).toThrow(/only for `init`/)
    expect(() => parseArgs(['init', '--force=yes'])).toThrow(/takes no value/)
    expect(() => parseArgs(['sync', '--cwd'])).toThrow(/--cwd needs a value/)
    expect(() => parseArgs(['sync', '--', '--debug'])).toThrow(/only for `dev` and `build`/)
  })
})

describe('templates', () => {
  it('names the crate after the app id', () => {
    expect(crateName('nu.frigear.crew')).toBe('crew')
    expect(crateName('nu.frigear.Crew_Desk')).toBe('crew_desk')
    expect(crateName('nu.frigear.9')).toBe('app')
    expect(libName('crew-desk')).toBe('crew_desk_lib')
  })
  it('adds the Rust plugins of the enabled features', () => {
    const base = cargoToml(manifest)
    expect(base).toContain('tauri-plugin-single-instance = { version = "2", features = ["deep-link"] }')
    expect(base).not.toContain('tauri-plugin-autostart')
    const all = cargoToml({ ...manifest, autostart: true, updater: true })
    expect(all).toContain('tauri-plugin-autostart = "2"')
    expect(all).toContain('tauri-plugin-updater = "2"')
    expect(cargoToml({ ...manifest, singleInstance: false })).not.toContain('cfg(not(any(')
    expect(libRs({ ...manifest, autostart: true, updater: true })).toMatch(/single_instance::init[\s\S]*autostart::init[\s\S]*updater::Builder/)
    expect(libRs({ ...manifest, singleInstance: false })).not.toContain('single_instance')
    expect(mainRs(manifest)).toContain('crew_lib::run()')
  })
  it('makes valid placeholder icons', () => {
    const png = solidPng(16)
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(16)
    expect(png[25]).toBe(6) // RGBA
    const ico = pngIco(png, 256)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico[6]).toBe(0) // 256px
    expect(ico.subarray(22).equals(png)).toBe(true)
  })
})

describe('init and sync', () => {
  let dir: string
  const log: string[] = []
  const io = { log: (message: string) => log.push(message) }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'frigear-desktop-'))
    log.length = 0
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('creates src-tauri and merges the generated config', () => {
    init(dir, generated, false, io)
    for (const path of Object.keys(initFiles(manifest))) expect(existsSync(join(dir, path)), path).toBe(true)
    const config = JSON.parse(readFileSync(join(dir, 'src-tauri/tauri.conf.json'), 'utf8'))
    expect(config).toMatchObject({
      identifier: 'nu.frigear.crew',
      build: { beforeDevCommand: 'npx nuxt dev --port 3000', beforeBuildCommand: 'npx nuxt generate', frontendDist: '../.output/public' },
      bundle: { active: true, icon: ['icons/icon.png', 'icons/icon.ico'] },
    })
    expect(JSON.parse(readFileSync(join(dir, 'src-tauri/capabilities/frigear.json'), 'utf8')).permissions).toContain('deep-link:default')
  })

  it('keeps existing files unless forced', () => {
    mkdirSync(join(dir, 'src-tauri/src'), { recursive: true })
    writeFileSync(join(dir, 'src-tauri/src/lib.rs'), '// mine\n')
    init(dir, generated, false, io)
    expect(readFileSync(join(dir, 'src-tauri/src/lib.rs'), 'utf8')).toBe('// mine\n')
    init(dir, generated, true, io)
    expect(readFileSync(join(dir, 'src-tauri/src/lib.rs'), 'utf8')).toContain('tauri::Builder')
  })

  it('syncs idempotently and keeps the app\'s own keys', () => {
    mkdirSync(join(dir, 'src-tauri'), { recursive: true })
    writeFileSync(join(dir, 'src-tauri/tauri.conf.json'), JSON.stringify({ identifier: 'old.id', build: { beforeDevCommand: 'pnpm dev' }, plugins: { fs: { scope: ['$APPDATA'] } } }))
    expect(syncProject(dir, generated, io)).toEqual(['src-tauri/tauri.conf.json', 'src-tauri/capabilities/frigear.json'])
    const first = readFileSync(join(dir, 'src-tauri/tauri.conf.json'), 'utf8')
    expect(JSON.parse(first)).toMatchObject({ identifier: 'nu.frigear.crew', build: { beforeDevCommand: 'pnpm dev' }, plugins: { fs: { scope: ['$APPDATA'] } } })
    expect(syncProject(dir, generated, io)).toEqual([])
    expect(readFileSync(join(dir, 'src-tauri/tauri.conf.json'), 'utf8')).toBe(first)
    expect(log.at(-1)).toMatch(/up to date/)
  })

  it('needs src-tauri to sync', () => {
    expect(() => syncProject(dir, generated, io)).toThrow(/frigear-desktop init/)
  })
})

describe('main', () => {
  let dir: string
  const lines: string[] = []
  const exec = vi.fn((_command: string, args: string[], cwd: string) => {
    if (args[0] === 'nuxt') {
      mkdirSync(join(cwd, '.nuxt/desktop'), { recursive: true })
      writeFileSync(join(cwd, '.nuxt/desktop/tauri.json'), JSON.stringify(generated.config))
      writeFileSync(join(cwd, '.nuxt/desktop/capabilities.json'), JSON.stringify(generated.capabilities))
      writeFileSync(join(cwd, '.nuxt/desktop/manifest.json'), JSON.stringify(generated.manifest))
    }
  })
  const io: Io = {
    log: message => lines.push(message),
    error: message => lines.push(message),
    exec,
    probe: () => ({ ok: true, stdout: '' }),
    platform: 'darwin',
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'frigear-desktop-main-'))
    lines.length = 0
    exec.mockClear()
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('prepares the app, then inits', async () => {
    expect(await main(['init', '--cwd', dir], io)).toBe(0)
    expect(exec).toHaveBeenCalledWith('npx', ['nuxt', 'prepare'], dir)
    expect(existsSync(join(dir, 'src-tauri/Cargo.toml'))).toBe(true)
  })

  it('refuses dev without @tauri-apps/cli', async () => {
    expect(await main(['dev', '--cwd', dir], io)).toBe(1)
    expect(lines.join('\n')).toMatch(/pnpm add -D @tauri-apps\/cli/)
  })

  it('syncs, then runs tauri with the passed options', async () => {
    mkdirSync(join(dir, 'node_modules/@tauri-apps/cli'), { recursive: true })
    writeFileSync(join(dir, 'node_modules/@tauri-apps/cli/package.json'), '{"name":"@tauri-apps/cli"}')
    await main(['init', '--cwd', dir], io)
    exec.mockClear()
    expect(await main(['build', '--cwd', dir, '--', '--debug'], io)).toBe(0)
    expect(exec.mock.calls.map(call => call.slice(0, 2))).toEqual([['npx', ['nuxt', 'prepare']], ['npx', ['tauri', 'build', '--debug']]])
  })

  it('refuses a missing app id', async () => {
    exec.mockImplementationOnce((_command, _args, cwd) => {
      mkdirSync(join(cwd, '.nuxt/desktop'), { recursive: true })
      writeFileSync(join(cwd, '.nuxt/desktop/manifest.json'), JSON.stringify({ ...manifest, appId: 'com.example.desktop' }))
    })
    expect(await main(['sync', '--cwd', dir], io)).toBe(1)
    expect(lines.join('\n')).toMatch(/desktop.appId/)
  })

  it('exits with 1 when the doctor finds a blocker', async () => {
    expect(await main(['doctor', '--cwd', dir], { ...io, probe: () => ({ ok: false, stdout: '' }) })).toBe(1)
  })
})
