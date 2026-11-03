import { runCommand } from 'citty'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../../..')

// Copies the repository's own folder instead of downloading it: `gh:Frigear-nu/frigear-nu/<path>#<ref>` → <repo>/<path>.
vi.mock('giget', () => ({
  downloadTemplate: vi.fn(async (input: string, options: { dir: string, cwd?: string }) => {
    const dir = resolve(options.cwd ?? process.cwd(), options.dir)
    const match = input.match(/^gh:Frigear-nu\/frigear-nu\/([^#]+)/)
    if (match) await cp(join(repoRoot, match[1]!), dir, { recursive: true })
    else await mkdir(dir, { recursive: true }).then(() => writeFile(join(dir, 'package.json'), '{"name":"my-module"}'))
    return { dir, source: input, name: input, tar: '' }
  }),
}))
vi.mock('../src/utils/install.ts', () => ({
  installDeps: vi.fn(),
  addDeps: vi.fn(),
  runPackageScript: vi.fn(),
}))

const run = async (name: string, rawArgs: string[]) => {
  const { mainCmd } = await import('../src/cli.ts')
  const sub = await (mainCmd.subCommands as Record<string, () => Promise<Parameters<typeof runCommand>[0]>>)[name]!()
  return runCommand(sub, { rawArgs })
}

const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf-8'))

let cwd: string
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'frigear-cli-'))
  vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`process.exit(${code})`)
  })
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(cwd, { recursive: true, force: true })
})

describe('init', () => {
  it('copies the starter and names the root package after the directory', async () => {
    await run('init', ['my-project', '--starter', 'workspace', '--no-install', '--cwd', cwd])
    expect(existsSync(join(cwd, 'my-project/apps/web/nuxt.config.ts'))).toBe(true)
    expect((await readJson(join(cwd, 'my-project/package.json'))).name).toBe('my-project')
  })

  it('refuses a directory that is not empty', async () => {
    await mkdir(join(cwd, 'taken'))
    await writeFile(join(cwd, 'taken/file'), '')
    await expect(run('init', ['taken', '--starter', 'workspace', '--no-install', '--cwd', cwd])).rejects.toThrow('process.exit(1)')
  })

  it('rejects an unknown starter', async () => {
    await expect(run('init', ['x', '--starter', 'nope', '--no-install', '--cwd', cwd])).rejects.toThrow('process.exit(1)')
  })
})

describe('app:create', () => {
  it('adds the app under apps/ with the workspace scope', async () => {
    await run('init', ['project', '--starter', 'workspace', '--no-install', '--cwd', cwd])
    const project = join(cwd, 'project')
    await run('app:create', ['mobile', '--template', 'mobile', '--no-install', '--cwd', project])
    const pkg = await readJson(join(project, 'apps/mobile/package.json'))
    expect(pkg.name).toBe('@workspace/mobile')
  })

  it('fails outside a pnpm workspace', async () => {
    await expect(run('app:create', ['web', '--no-install', '--cwd', cwd])).rejects.toThrow('process.exit(1)')
  })
})

describe('module:create', () => {
  it('uses the root package scope of the workspace', async () => {
    await writeFile(join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
    await writeFile(join(cwd, 'package.json'), '{"name":"@acme/root"}')
    await run('module:create', ['myModule', '--cwd', cwd])
    expect((await readJson(join(cwd, 'packages/my-module/package.json'))).name).toBe('@acme/my-module')
  })

  it('leaves the name unscoped with --scope ""', async () => {
    await writeFile(join(cwd, 'package.json'), '{"name":"@acme/root"}')
    await run('module:create', ['thing', '--scope', '', '--cwd', cwd])
    expect((await readJson(join(cwd, 'packages/thing/package.json'))).name).toBe('thing')
  })
})

describe('add', () => {
  it('adds the module to nuxt.config once', async () => {
    const app = join(cwd, 'apps/web')
    await mkdir(app, { recursive: true })
    await writeFile(join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n')
    await writeFile(join(app, 'nuxt.config.ts'), `export default defineNuxtConfig({\n  modules: ['@nuxt/ui'],\n})\n`)

    await run('add', ['forms', '--no-install', '--cwd', cwd])
    await run('add', ['@frigear-nu/forms', '--no-install', '--cwd', cwd])

    const config = await readFile(join(app, 'nuxt.config.ts'), 'utf-8')
    expect(config.match(/@frigear-nu\/forms/g)).toHaveLength(1)
    expect(config).toContain('@nuxt/ui')
    expect(config.endsWith('})\n')).toBe(true)
  })

  it('asks for --app when there are several apps', async () => {
    await writeFile(join(cwd, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n')
    for (const name of ['a', 'b']) {
      await mkdir(join(cwd, 'apps', name), { recursive: true })
      await writeFile(join(cwd, 'apps', name, 'nuxt.config.ts'), 'export default defineNuxtConfig({})\n')
    }
    await expect(run('add', ['forms', '--no-install', '--cwd', cwd])).rejects.toThrow('process.exit(1)')
    await run('add', ['forms', '--app', 'b', '--no-install', '--cwd', cwd])
    expect(await readFile(join(cwd, 'apps/b/nuxt.config.ts'), 'utf-8')).toContain('@frigear-nu/forms')
  })
})
