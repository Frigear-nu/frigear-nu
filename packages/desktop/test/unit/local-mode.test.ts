import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopManifest } from '../../src/types'
import { capabilities, capabilityPermissions, resolveDesktopOptions, resolveSchemes, tauriConfig, usedPlugins } from '../../src/runtime/shared/config'
import { baseTauriConfig, cargoToml, libRs, loadingPage } from '../../src/runtime/cli/templates'
import { bunTarget, buildSidecar, hostTriple, init, main, parseArgs, passthroughTarget, sidecarPath, type Io } from '../../src/runtime/cli/main'
import { runDoctor } from '../../src/runtime/cli/doctor'
import { applyLocalNitroConfig, localBootstrapTemplate, localDbTemplate, appHasUnstorage, localEntryTemplate, type LocalNitroConfig } from '../../src/build'

const options = resolveDesktopOptions({ appId: 'nu.frigear.crew', appName: 'Crew', mode: 'local' }, { packageVersion: '1.0.0' }).options
const manifest: DesktopManifest = {
  appId: 'nu.frigear.crew', appName: 'Crew', version: '1.0.0', mode: 'local', devUrl: 'http://localhost:3000', redirectUri: '',
  schemes: ['nu.frigear.crew'], singleInstance: true, autostart: false, updater: false,
  plugins: [{ name: '@tauri-apps/api', required: true, feature: 'window' }],
  local: { binaryName: 'crew-server', port: 0, dataDirName: 'data' },
}
const generated = { config: tauriConfig(options), capabilities: capabilities(options), manifest }

describe('local tauri config', () => {
  it('bundles the sidecar and shows the loading page until the server is ready', () => {
    const config = tauriConfig(options)
    expect(config.build).toEqual({ frontendDist: 'frigear-loading', devUrl: 'http://localhost:3000' })
    expect(config.bundle).toEqual({ active: true, externalBin: ['binaries/crew-server'] })
  })

  it('lets the server\'s pages use the permissions, without granting them the shell', () => {
    const capability = capabilities(options)
    expect(capability.remote).toEqual({ urls: ['http://127.0.0.1:*'] })
    expect(capability.permissions).toEqual(capabilityPermissions(options))
    expect((capability.permissions as string[]).some(permission => permission.startsWith('shell:'))).toBe(false)
    expect(capabilities({ autostart: false, updater: false }).remote).toBeUndefined()
  })

  it('lets the server\'s pages sign in at an issuer with resource auth (system browser, deep link, store)', () => {
    const resource = resolveDesktopOptions({ appId: 'nu.frigear.crew', mode: 'local' }, { authMode: 'resource' }).options
    const capability = capabilities(resource)
    expect(capability.remote).toEqual({ urls: ['http://127.0.0.1:*'] })
    expect(capability.permissions).toEqual(expect.arrayContaining(['opener:default', 'deep-link:default', 'store:default', 'core:window:allow-set-focus']))
    expect(usedPlugins(resource, true).filter(plugin => plugin.required).map(plugin => plugin.name)).toEqual(expect.arrayContaining([
      '@tauri-apps/plugin-deep-link', '@tauri-apps/plugin-opener', '@tauri-apps/plugin-store',
    ]))
    expect(tauriConfig(resource, resolveSchemes('nu.frigear.crew:/auth/callback', resource.deepLinks.schemes)).plugins).toEqual({ 'deep-link': { desktop: { schemes: ['nu.frigear.crew'] } } })
  })
})

describe('local templates', () => {
  it('adds the shell plugin', () => {
    expect(cargoToml(manifest)).toContain('tauri-plugin-shell = "2"')
    expect(cargoToml({ ...manifest, local: null })).not.toContain('tauri-plugin-shell')
  })

  it('spawns the sidecar, waits for READY and navigates the main window to it', () => {
    const rs = libRs(manifest)
    expect(rs).toContain('.plugin(tauri_plugin_shell::init())')
    expect(rs).toContain('const SIDECAR: &str = "crew-server";')
    expect(rs).toContain('const DATA_DIR_NAME: &str = "data";')
    expect(rs).toContain('const PORT: u16 = 0;')
    expect(rs).toMatch(/\.sidecar\(SIDECAR\)\?[\s\S]*\.env\("PORT", PORT\.to_string\(\)\)[\s\S]*\.env\("HOST", "127\.0\.0\.1"\)[\s\S]*\.env\("DATA_DIR", &data_dir\)/)
    expect(rs).toContain('app.path().app_data_dir()?.join(DATA_DIR_NAME)')
    expect(rs).toContain('strip_prefix("READY ")')
    expect(rs).toContain('format!("http://127.0.0.1:{port}/").parse::<tauri::Url>()')
    expect(rs).toContain('window.navigate(url)')
    expect(rs).toContain('window.frigearServerFailed')
    // Started in setup outside `tauri dev`, killed on exit.
    expect(rs).toMatch(/#\[cfg\(not\(dev\)\)\]\s+local_server::start\(_app\.handle\(\)\)\?;/)
    expect(rs).toMatch(/tauri::RunEvent::Exit = _event[\s\S]*local_server::stop\(_app\)/)
    expect(rs).toContain('child.kill()')
    // Single instance stays on.
    expect(rs).toContain('tauri_plugin_single_instance::init')
  })

  it('leaves remote apps as they were', () => {
    const rs = libRs({ ...manifest, local: null })
    expect(rs).not.toContain('local_server')
    expect(rs).toContain('.run(tauri::generate_context!())')
  })

  it('builds the server itself instead of `nuxt generate`', () => {
    expect(baseTauriConfig(manifest).build).toMatchObject({ beforeBuildCommand: '' })
  })

  it('writes an escaped loading page that reports a failed start', () => {
    const page = loadingPage('Crew <Desk>')
    expect(page).toContain('Starting Crew &#60;Desk&#62;…')
    expect(page).toContain('window.frigearServerFailed = function (message)')
  })
})

describe('local CLI', () => {
  let dir: string
  const lines: string[] = []
  const exec = vi.fn((command: string, args: string[], cwd: string) => {
    if (args[0] === 'nuxt' && args[1] === 'prepare') {
      mkdirSync(join(cwd, '.nuxt/desktop'), { recursive: true })
      writeFileSync(join(cwd, '.nuxt/desktop/tauri.json'), JSON.stringify(generated.config))
      writeFileSync(join(cwd, '.nuxt/desktop/capabilities.json'), JSON.stringify(generated.capabilities))
      writeFileSync(join(cwd, '.nuxt/desktop/manifest.json'), JSON.stringify(generated.manifest))
    }
    if (args[0] === 'nuxt' && args[1] === 'build') {
      mkdirSync(join(cwd, '.output/server'), { recursive: true })
      writeFileSync(join(cwd, '.output/server/index.mjs'), '')
    }
  })
  const io: Io = {
    log: message => lines.push(message),
    error: message => lines.push(message),
    exec,
    probe: command => ({ ok: command === 'bun', stdout: '' }),
    platform: 'darwin',
    arch: 'arm64',
    env: {},
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'frigear-desktop-local-'))
    lines.length = 0
    exec.mockClear()
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('maps target triples', () => {
    expect(bunTarget('aarch64-apple-darwin')).toBe('bun-darwin-arm64')
    expect(bunTarget('x86_64-pc-windows-msvc')).toBe('bun-windows-x64')
    expect(bunTarget('x86_64-unknown-linux-musl')).toBe('bun-linux-x64-musl')
    expect(() => bunTarget('riscv64gc-unknown-linux-gnu')).toThrow(/x86_64 and aarch64/)
    expect(sidecarPath('crew-server', 'x86_64-pc-windows-msvc')).toBe('src-tauri/binaries/crew-server-x86_64-pc-windows-msvc.exe')
    expect(sidecarPath('crew-server', 'aarch64-apple-darwin')).toBe('src-tauri/binaries/crew-server-aarch64-apple-darwin')
    expect(hostTriple({ probe: () => ({ ok: true, stdout: 'rustc 1.80\nhost: x86_64-unknown-linux-musl\n' }), platform: 'linux', arch: 'x64' })).toBe('x86_64-unknown-linux-musl')
    expect(hostTriple({ probe: () => ({ ok: false, stdout: '' }), platform: 'win32', arch: 'arm64' })).toBe('aarch64-pc-windows-msvc')
    expect(passthroughTarget(['--debug', '--target', 'x86_64-apple-darwin'])).toBe('x86_64-apple-darwin')
    expect(passthroughTarget(['--target=aarch64-apple-darwin'])).toBe('aarch64-apple-darwin')
    expect(passthroughTarget(['--debug'])).toBeUndefined()
  })

  it('parses `sidecar --target`', () => {
    expect(parseArgs(['sidecar', '--target', 'x86_64-apple-darwin'])).toMatchObject({ command: 'sidecar', target: 'x86_64-apple-darwin' })
    expect(() => parseArgs(['build', '--target', 'x'])).toThrow(/only for `sidecar`/)
  })

  it('builds the server, then compiles it with Bun for the target', () => {
    const output = buildSidecar(dir, manifest, undefined, io)
    expect(output).toBe('src-tauri/binaries/crew-server-aarch64-apple-darwin')
    expect(exec.mock.calls.map(call => call.slice(0, 2))).toEqual([
      ['npx', ['nuxt', 'build']],
      ['bun', ['build', '--compile', '--minify', '--sourcemap=none', '--target=bun-darwin-arm64', join(dir, '.output/server/index.mjs'), '--outfile', join(dir, output)]],
    ])
  })

  it('uses BUN and fails clearly without Bun', () => {
    buildSidecar(dir, manifest, 'x86_64-apple-darwin', { ...io, env: { BUN: '/opt/bun' }, probe: command => ({ ok: command === '/opt/bun', stdout: '' }) })
    expect(exec.mock.calls.at(-1)![0]).toBe('/opt/bun')
    expect(() => buildSidecar(dir, manifest, undefined, { ...io, probe: () => ({ ok: false, stdout: '' }) })).toThrow(/Bun was not found/)
    expect(() => buildSidecar(dir, { ...manifest, local: null }, undefined, io)).toThrow(/not `local`/)
  })

  it('init writes the loading page; build compiles the sidecar before `tauri build`', async () => {
    mkdirSync(join(dir, 'node_modules/@tauri-apps/cli'), { recursive: true })
    writeFileSync(join(dir, 'node_modules/@tauri-apps/cli/package.json'), '{}')
    init(dir, generated, false, io)
    expect(readFileSync(join(dir, 'src-tauri/frigear-loading/index.html'), 'utf8')).toContain('Starting Crew')
    expect(readFileSync(join(dir, 'src-tauri/src/lib.rs'), 'utf8')).toContain('local_server')

    expect(await main(['build', '--cwd', dir, '--', '--target', 'x86_64-apple-darwin'], io)).toBe(0)
    const calls = exec.mock.calls.map(call => [call[0], call[1].slice(0, 2)])
    expect(calls).toEqual([['npx', ['nuxt', 'prepare']], ['npx', ['nuxt', 'build']], ['bun', ['build', '--compile']], ['npx', ['tauri', 'build']]])
    const tauri = exec.mock.calls.at(-1)![1]
    expect(tauri.slice(2, 3)).toEqual(['--config'])
    expect(JSON.parse(readFileSync(tauri[3]!, 'utf8'))).toEqual({ build: { beforeBuildCommand: '' } })
    expect(tauri.slice(4)).toEqual(['--target', 'x86_64-apple-darwin'])
    expect(exec.mock.calls[2]![1]).toContain('--target=bun-darwin-x64')
  })

  it('runs `tauri dev` without the sidecar', async () => {
    mkdirSync(join(dir, 'node_modules/@tauri-apps/cli'), { recursive: true })
    writeFileSync(join(dir, 'node_modules/@tauri-apps/cli/package.json'), '{}')
    init(dir, generated, false, io)
    expect(await main(['dev', '--cwd', dir], io)).toBe(0)
    const tauri = exec.mock.calls.at(-1)![1]
    expect(tauri.slice(0, 3)).toEqual(['tauri', 'dev', '--config'])
    expect(JSON.parse(readFileSync(tauri[3]!, 'utf8'))).toEqual({ bundle: { externalBin: [] } })
    expect(exec.mock.calls.some(call => call[1][1] === 'build')).toBe(false)
  })

  it('`sidecar` builds without Tauri', async () => {
    expect(await main(['sidecar', '--cwd', dir], io)).toBe(0)
    expect(exec.mock.calls.map(call => call[1][0] === 'build' ? 'bun' : call[1].slice(0, 2).join(' '))).toEqual(['nuxt prepare', 'nuxt build', 'bun'])
    expect(existsSync(join(dir, 'src-tauri/binaries'))).toBe(true)
  })
})

describe('local doctor', () => {
  const input = (overrides: Partial<Parameters<typeof runDoctor>[0]> = {}) => runDoctor({
    platform: 'darwin',
    exec: () => ({ ok: true, stdout: '' }),
    isInstalled: () => true,
    readFile: path => ({ 'src-tauri/tauri.conf.json': '{}', 'src-tauri/Cargo.toml': cargoToml(manifest) } as Record<string, string>)[path] ?? null,
    manifest,
    env: {},
    ...overrides,
  })

  it('passes with Bun and the shell plugin', () => {
    expect(input()).toEqual([])
  })

  it('needs Bun', () => {
    expect(input({ exec: command => ({ ok: command !== 'bun', stdout: '' }) }).map(f => f.message)).toEqual([expect.stringMatching(/Bun was not found.*bun\.sh/)])
    expect(input({ env: { BUN: '/nope' }, exec: command => ({ ok: command !== '/nope', stdout: '' }) }).map(f => f.message)).toEqual([expect.stringMatching(/`BUN` is set to "\/nope"/)])
  })

  it('needs tauri-plugin-shell in Cargo.toml', () => {
    const findings = input({ readFile: path => (path === 'src-tauri/Cargo.toml' ? cargoToml({ ...manifest, local: null }) : '{}') })
    expect(findings.map(f => f.message)).toEqual([expect.stringMatching(/tauri-plugin-shell/)])
  })
})

describe('local build', () => {
  const paths = { dbModule: '/app/.nuxt/desktop/local/db.mjs', hubDb: true, schemaModule: '/app/node_modules/@nuxthub/db/schema.mjs', migrationsDir: '/app/.data/db/migrations', plugin: '/pkg/plugin' }

  it('makes one self-contained bun bundle with the local database', () => {
    const nitro = applyLocalNitroConfig({ preset: 'node-server', rollupConfig: { external: ['sharp'] }, alias: { '#x': '/x' } }, paths)
    expect(nitro).toMatchObject({
      preset: 'bun',
      serveStatic: 'inline',
      noExternals: true,
      inlineDynamicImports: true,
      rollupConfig: { external: ['sharp', 'bun:sqlite'] },
      alias: {
        '#x': '/x',
        '#desktop/local-db': paths.dbModule,
        '@nuxthub/db': paths.dbModule,
        'hub:db': paths.dbModule,
        '@nuxthub/db/schema': paths.schemaModule,
        'hub:db:schema': paths.schemaModule,
      },
      serverAssets: [{ baseName: 'desktop-migrations', dir: paths.migrationsDir }],
      plugins: [paths.plugin],
    })
    // Applying twice changes nothing.
    expect(applyLocalNitroConfig(structuredClone(nitro) as LocalNitroConfig, paths)).toEqual(nitro)
  })

  it('wraps a function external and leaves NuxtHub alone without a database', () => {
    const nitro = applyLocalNitroConfig({ rollupConfig: { external: (id: string) => id === 'sharp' } }, { ...paths, hubDb: false })
    const external = nitro.rollupConfig!.external as (id: string) => boolean
    expect([external('bun:sqlite'), external('sharp'), external('vue')]).toEqual([true, true, false])
    expect(nitro.alias).toEqual({ '#desktop/local-db': paths.dbModule })
    expect(nitro.serverAssets).toEqual([])
  })

  it('generates the client, the bootstrap and the entry', () => {
    const db = localDbTemplate('/pkg/local-db', 'snake_case')
    expect(db).toContain('import { Database } from \'bun:sqlite\'')
    expect(db).toContain('import * as schema from \'@nuxthub/db/schema\'')
    expect(db).toContain('join(process.env.DATA_DIR || process.cwd(), \'app.db\')')
    expect(db).toContain('drizzle(proxy.query, proxy.batch, { schema, casing: "snake_case" })')
    expect(localDbTemplate('/pkg/local-db')).toContain('{ schema })')
    expect(localBootstrapTemplate('/pkg/bootstrap', { port: 0, secrets: ['NUXT_APP_SECRET'] })).toContain('prepareLocalServer({"port":0,"secrets":["NUXT_APP_SECRET"]})')
    const entry = localEntryTemplate('/app/.nuxt/desktop/local/bootstrap.mjs', '/nitro/presets/bun/runtime/bun.mjs')
    expect(entry.indexOf('bootstrap.mjs')).toBeLessThan(entry.indexOf('bun.mjs'))
  })
})

describe('appHasUnstorage', () => {
  it('is true only when the app resolves unstorage itself (NuxtHub KV imports it from the app)', () => {
    const root = mkdtempSync(join(tmpdir(), 'desktop-unstorage-'))
    expect(appHasUnstorage(root)).toBe(false)
    mkdirSync(join(root, 'node_modules', 'unstorage'), { recursive: true })
    writeFileSync(join(root, 'node_modules', 'unstorage', 'package.json'), '{"name":"unstorage"}')
    expect(appHasUnstorage(root)).toBe(true)
  })
})
