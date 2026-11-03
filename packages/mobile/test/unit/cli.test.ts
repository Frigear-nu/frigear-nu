import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main, parseArgs } from '../../src/runtime/cli/main'
import { readPlistSchemes } from '../../src/runtime/cli/plist'
import { readManifestLinks } from '../../src/runtime/cli/manifest'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

describe('parseArgs', () => {
  it('parses commands and options', () => {
    expect(parseArgs(['native', '--if-missing', '--platform', 'ios', '--platform=android', '--cwd', '/tmp/app']))
      .toEqual({ command: 'native', ifMissing: true, platforms: ['ios', 'android'], cwd: '/tmp/app', strict: false })
    expect(parseArgs(['doctor', '--strict'])).toMatchObject({ command: 'doctor', strict: true })
    expect(parseArgs([])).toMatchObject({ command: 'help' })
  })
  it('keeps everything after the first = and needs a value where one is expected', () => {
    expect(parseArgs(['doctor', '--cwd=/tmp/a=b']).cwd).toBe('/tmp/a=b')
    expect(() => parseArgs(['doctor', '--cwd'])).toThrow(/--cwd needs a value/)
    expect(() => parseArgs(['doctor', '--cwd', '--strict'])).toThrow(/--cwd needs a value/)
    expect(() => parseArgs(['native', '--platform='])).toThrow(/--platform needs a value/)
    expect(() => parseArgs(['doctor', '--strict=no'])).toThrow(/takes no value/)
  })
  it('rejects unknown input', () => {
    expect(() => parseArgs(['deploy'])).toThrow(/Unknown command/)
    expect(() => parseArgs(['native', '--platform', 'windows'])).toThrow(/ios or android/)
    expect(() => parseArgs(['native', '--force'])).toThrow(/Unknown option/)
  })
})

describe('frigear-mobile native', () => {
  let dir: string
  const log: string[] = []
  const exec = vi.fn((command: string, args: string[], cwd: string) => {
    // A fake `cap add`: the Capacitor templates.
    if (args[0] === 'cap' && args[2] === 'ios') {
      mkdirSync(join(cwd, 'ios/App/App'), { recursive: true })
      writeFileSync(join(cwd, 'ios/App/App/Info.plist'), fixture('Info.plist'))
    }
    if (args[0] === 'cap' && args[2] === 'android') {
      mkdirSync(join(cwd, 'android/app/src/main/res/values'), { recursive: true })
      writeFileSync(join(cwd, 'android/app/src/main/AndroidManifest.xml'), fixture('AndroidManifest.xml'))
      writeFileSync(join(cwd, 'android/app/src/main/res/values/strings.xml'), fixture('strings.xml'))
    }
    if (args[0] === 'nuxt') {
      mkdirSync(join(cwd, '.nuxt/mobile'), { recursive: true })
      writeFileSync(join(cwd, '.nuxt/mobile/native.json'), JSON.stringify({
        appId: 'nu.frigear.app', appName: 'App', redirectUri: 'nu.frigear.app:/auth/callback', schemes: ['nu.frigear.app'],
        hosts: ['app.frigear.nu'], allowLocalNetworking: true, plugins: [{ name: '@capacitor/core', required: true, feature: 'Capacitor' }],
      }))
    }
  })
  const io = { log: (message: string) => log.push(message), error: (message: string) => log.push(message), exec }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'frigear-mobile-'))
    log.length = 0
    exec.mockClear()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      dependencies: { '@capacitor/core': '^8', '@capacitor/ios': '^8', '@capacitor/android': '^8' },
      devDependencies: { '@capacitor/cli': '^8' },
    }))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('adds the missing platforms, patches them, and is a no-op with --if-missing afterwards', async () => {
    expect(await main(['native', '--cwd', dir], io)).toBe(0)
    expect(exec.mock.calls.map(([command, args]) => [command, ...args].join(' '))).toEqual(['npx nuxt prepare', 'npx cap add ios', 'npx cap add android'])
    expect(readFileSync(join(dir, '.output/public/index.html'), 'utf8')).toContain('nuxt generate')
    expect(readPlistSchemes(readFileSync(join(dir, 'ios/App/App/Info.plist'), 'utf8'))).toEqual(['nu.frigear.app'])
    expect(readManifestLinks(readFileSync(join(dir, 'android/app/src/main/AndroidManifest.xml'), 'utf8')))
      .toEqual({ schemes: ['nu.frigear.app'], hosts: ['app.frigear.nu'] })
    expect(log.at(-1)).toContain('look right')

    exec.mockClear()
    expect(await main(['native', '--if-missing', '--cwd', dir], io)).toBe(0)
    expect(exec).not.toHaveBeenCalled()

    // Running again re-reads the settings and changes nothing.
    log.length = 0
    expect(await main(['native', '--cwd', dir], io)).toBe(0)
    expect(log.filter(line => line.includes('is up to date'))).toHaveLength(2)
  })

  it('fails without a platform package', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { '@capacitor/core': '^8' } }))
    expect(await main(['native', '--cwd', dir], io)).toBe(1)
    expect(log.at(-1)).toMatch(/No platform/)
  })

  it('doctor --strict exits 1 on errors', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: {} }))
    expect(await main(['doctor', '--strict', '--cwd', dir], io)).toBe(1)
    expect(await main(['doctor', '--cwd', dir], io)).toBe(0)
  })
})
