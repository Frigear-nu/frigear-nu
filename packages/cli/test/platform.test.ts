import { runCommand } from 'citty'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addPlatform } from '../src/platform/add.ts'
import { PlatformError } from '../src/platform/errors.ts'
import { initPlatform } from '../src/platform/init.ts'
import { execBin, runPackageScript } from '../src/utils/install.ts'

const repoRoot = resolve(import.meta.dirname, '../../..')

// Copies the repository's own folder instead of downloading it: `gh:Frigear-nu/frigear-nu/<path>#<ref>` → <repo>/<path>.
vi.mock('giget', () => ({
  downloadTemplate: vi.fn(async (input: string, options: { dir: string, cwd?: string }) => {
    const dir = resolve(options.cwd ?? process.cwd(), options.dir)
    const match = input.match(/^gh:Frigear-nu\/frigear-nu\/([^#]+)/)
    if (match) await cp(join(repoRoot, match[1]!), dir, { recursive: true })
    else await mkdir(dir, { recursive: true }).then(() => writeFile(join(dir, 'package.json'), '{"name":"custom-template"}'))
    return { dir, source: input, name: input, tar: '' }
  }),
}))
vi.mock('../src/utils/install.ts', () => ({
  installDeps: vi.fn(),
  addDeps: vi.fn(),
  runPackageScript: vi.fn(),
  execBin: vi.fn(),
  packageManagerOf: vi.fn(async () => 'pnpm'),
}))

const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf-8'))

const platform = async (rawArgs: string[]) => {
  const { mainCmd } = await import('../src/cli.ts')
  const sub = await (mainCmd.subCommands as Record<string, () => Promise<Parameters<typeof runCommand>[0]>>).platform!()
  return runCommand(sub, { rawArgs })
}

/** A web-only project like the workspace starter's: `@workspace/web` in apps/, `apps/*` and `packages/*` globs. */
const webProject = async (dir: string, extra: Record<string, unknown> = {}) => {
  await mkdir(join(dir, 'apps/web'), { recursive: true })
  await writeFile(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - \'apps/*\'\n  - \'packages/*\'\n')
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'project', scripts: { 'dev': 'pnpm --filter ./apps/web dev', 'prepare:env': 'pnpx @frigear-nu/cli prepare env' }, ...extra }))
  await writeFile(join(dir, 'apps/web/package.json'), JSON.stringify({ name: '@workspace/web', dependencies: { nuxt: '^4.0.0' } }))
  return dir
}

let cwd: string
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'frigear-platform-'))
  vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`process.exit(${code})`)
  })
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.mocked(runPackageScript).mockClear()
  vi.mocked(execBin).mockClear()
  await rm(cwd, { recursive: true, force: true })
})

describe('addPlatform', () => {
  it('adds the mobile app in the workspace scope, records the platform and adds the starter\'s root scripts', async () => {
    const root = await webProject(cwd)
    const result = await addPlatform({ cwd: root, platform: 'mobile', install: false })

    expect(result.appDir).toBe(join(root, 'apps/mobile'))
    const pkg = await readJson(join(root, 'apps/mobile/package.json'))
    expect(pkg.name).toBe('@workspace/mobile')
    expect(pkg.frigear).toEqual({ platform: 'mobile' })

    const scripts = (await readJson(join(root, 'package.json'))).scripts
    expect(scripts['mobile:ios']).toBe('pnpm --filter ./apps/mobile run ios:run')
    expect(scripts.dev).toBe('pnpm --filter ./apps/web dev')
    // The default names are the multi-platform starter's.
    const starter = Object.keys((await readJson(join(repoRoot, '.starters/multi-platform/package.json'))).scripts)
    expect(result.scripts.added.sort()).toEqual(starter.filter(key => key.startsWith('mobile:') || key === 'dev:mobile').sort())
  })

  it('reproduces the multi-platform starter\'s desktop script names', async () => {
    const root = await webProject(cwd)
    const result = await addPlatform({ cwd: root, platform: 'desktop', install: false })
    const starter = Object.keys((await readJson(join(repoRoot, '.starters/multi-platform/package.json'))).scripts)
    expect(result.scripts.added.sort()).toEqual(starter.filter(key => key.startsWith('desktop:') || key === 'dev:desktop').sort())
  })

  it('puts the app in the apps folder it is run from', async () => {
    const root = await webProject(cwd)
    await addPlatform({ cwd: join(root, 'apps'), platform: 'mobile', install: false })
    expect(existsSync(join(root, 'apps/mobile/package.json'))).toBe(true)
    expect(existsSync(join(root, 'apps/apps'))).toBe(false)
  })

  it('takes a second app of the same platform under its own name and scripts', async () => {
    const root = await webProject(cwd)
    await addPlatform({ cwd: root, platform: 'mobile', install: false })
    const result = await addPlatform({ cwd: root, platform: 'mobile', name: 'Tablet', install: false })
    expect(result.appName).toBe('tablet')
    const scripts = (await readJson(join(root, 'package.json'))).scripts
    expect(scripts['tablet:ios']).toBe('pnpm --filter ./apps/tablet run ios:run')
    expect(scripts['mobile:ios']).toBe('pnpm --filter ./apps/mobile run ios:run')
    expect(result.nextSteps.join('\n')).toContain('apps/tablet/identity.ts')
  })

  it('refuses an app folder that is taken', async () => {
    const root = await webProject(cwd)
    await expect(addPlatform({ cwd: root, platform: 'web', install: false })).rejects.toMatchObject({ code: 'APP_EXISTS' })
  })

  it('keeps the root\'s own scripts', async () => {
    const root = await webProject(cwd)
    await addPlatform({ cwd: root, platform: 'web', name: 'admin', install: false })
    const scripts = (await readJson(join(root, 'package.json'))).scripts
    expect(scripts['dev:admin']).toBe('pnpm --filter ./apps/admin dev')
    expect(scripts['db:generate']).toBe('pnpm --filter ./apps/admin db:generate')
  })

  it('starts a platform of its own from a template name', async () => {
    const root = await webProject(cwd)
    const result = await addPlatform({ cwd: root, platform: 'display', name: 'lobby', template: 'web', install: false })
    expect(result.platform).toBe('display')
    expect(result.scripts.added).toEqual([])
    const pkg = await readJson(join(root, 'apps/lobby/package.json'))
    expect(pkg.frigear.platform).toBe('display')
    expect(existsSync(join(root, 'apps/lobby/nuxt.config.ts'))).toBe(true)
  })

  it('uses the project\'s platforms and templates from frigear in the root package.json', async () => {
    const root = await webProject(cwd, {
      frigear: {
        templates: { kiosk: 'gh:acme/templates/kiosk' },
        platforms: { display: { template: 'kiosk', scripts: { '<name>:flash': 'pnpm --filter <dir> run flash' }, targets: { flash: { script: 'flash' } } } },
      },
    })
    const result = await addPlatform({ cwd: root, platform: 'display', name: 'bar', install: false })
    expect(result.source).toBe('gh:acme/templates/kiosk')
    expect((await readJson(join(root, 'package.json'))).scripts['bar:flash']).toBe('pnpm --filter ./apps/bar run flash')
  })

  it('rejects an unknown platform without a template, and an unknown template name', async () => {
    const root = await webProject(cwd)
    await expect(addPlatform({ cwd: root, platform: 'toaster', install: false })).rejects.toMatchObject({ code: 'UNKNOWN_PLATFORM' })
    await expect(addPlatform({ cwd: root, platform: 'mobile', template: 'nope', install: false })).rejects.toMatchObject({ code: 'UNKNOWN_TEMPLATE' })
  })

  it('fails outside a workspace', async () => {
    await expect(addPlatform({ cwd, platform: 'mobile', install: false })).rejects.toBeInstanceOf(PlatformError)
  })
})

describe('initPlatform', () => {
  it('runs the app\'s script for a target, else its binary', async () => {
    const root = await webProject(cwd)
    await addPlatform({ cwd: root, platform: 'mobile', install: false })

    const ios = await initPlatform({ cwd: root, target: 'ios', dryRun: true })
    expect(ios.app.name).toBe('mobile')
    expect(ios.command).toEqual({ kind: 'script', name: 'native', args: ['--platform', 'ios'] })

    const watch = await initPlatform({ cwd: root, target: 'watchos', dryRun: true })
    expect(watch.target).toBe('apple-watch')
    const pkg = await readJson(join(root, 'apps/mobile/package.json'))
    expect(watch.command).toEqual(pkg.scripts.watch
      ? { kind: 'script', name: 'watch', args: [] }
      : { kind: 'exec', name: 'frigear-mobile', args: ['watch'] })
  })

  it('asks which app when several have the target, and takes the one it is run in', async () => {
    const root = await webProject(cwd)
    await addPlatform({ cwd: root, platform: 'mobile', install: false })
    await addPlatform({ cwd: root, platform: 'mobile', name: 'tablet', install: false })

    await expect(initPlatform({ cwd: root, target: 'ios', dryRun: true })).rejects.toMatchObject({ code: 'APP_AMBIGUOUS', candidates: ['mobile', 'tablet'] })
    expect((await initPlatform({ cwd: root, target: 'ios', app: 'tablet', dryRun: true })).app.name).toBe('tablet')
    expect((await initPlatform({ cwd: join(root, 'apps/tablet'), target: 'ios', dryRun: true })).app.name).toBe('tablet')
  })

  it('rejects a target the app\'s platform does not have', async () => {
    const root = await webProject(cwd)
    await expect(initPlatform({ cwd: root, target: 'ios', app: 'web', dryRun: true })).rejects.toMatchObject({ code: 'UNKNOWN_TARGET' })
    await expect(initPlatform({ cwd: root, target: 'ios', dryRun: true })).rejects.toMatchObject({ code: 'APP_NOT_FOUND' })
  })

  it('finds a project platform\'s target', async () => {
    const root = await webProject(cwd, { frigear: { platforms: { display: { template: 'web', targets: { flash: { bin: ['flasher', 'write'] } } } } } })
    await addPlatform({ cwd: root, platform: 'display', name: 'lobby', install: false })
    const result = await initPlatform({ cwd: root, target: 'flash', dryRun: true })
    expect(result.command).toEqual({ kind: 'exec', name: 'flasher', args: ['write'] })
  })
})

describe('platform command', () => {
  it('adds from the apps folder and passes flags after -- to init', async () => {
    const root = await webProject(cwd)
    await platform(['add', 'mobile', '--no-install', '--cwd', join(root, 'apps')])
    expect(existsSync(join(root, 'apps/mobile/package.json'))).toBe(true)

    await platform(['init', 'android', '--cwd', join(root, 'apps/mobile'), '--', '--if-missing'])
    expect(runPackageScript).toHaveBeenCalledWith('native', join(root, 'apps/mobile'), ['--platform', 'android', '--if-missing'])
  })

  it('exits with 1 on a taken name outside a terminal', async () => {
    const root = await webProject(cwd)
    await expect(platform(['add', 'web', '--no-install', '--cwd', root])).rejects.toThrow('process.exit(1)')
  })

  it('lists platforms and apps', async () => {
    const root = await webProject(cwd)
    await expect(platform(['list', '--cwd', root])).resolves.toBeDefined()
  })
})
