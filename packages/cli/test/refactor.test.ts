import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { planModuleFolder } from '../src/commands/module-folder.ts'
import { importedPackages, matchesWorkspaceGlobs, planModuleMove } from '../src/commands/module-move.ts'
import {
  planPackageRename,
  renameInManifest,
  renameInMarkdown,
  renameInSource,
  renameInWorkspaceYaml,
  resolveNewPackageName,
} from '../src/commands/package-rename.ts'
import { applyPlan, describePlan, relocate } from '../src/utils/refactor.ts'

let root: string
const write = async (path: string, text: string) => {
  await mkdir(dirname(join(root, path)), { recursive: true })
  await writeFile(join(root, path), text)
}
const read = (path: string) => readFile(join(root, path), 'utf-8')
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'frigear-refactor-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('package:rename helpers', () => {
  it('gives a bare name the old scope', () => {
    expect(resolveNewPackageName('@acme/old', 'forms')).toBe('@acme/forms')
    expect(resolveNewPackageName('@acme/old', '@other/forms')).toBe('@other/forms')
    expect(resolveNewPackageName('old', 'forms')).toBe('forms')
  })

  it('renames the name and dependency keys of a manifest, keeping specs and formatting', () => {
    const text = `{\n  "name": "@acme/old",\n  "dependencies": {\n    "@acme/old": "workspace:*",\n    "@acme/old-two": "1.0.0"\n  },\n  "peerDependenciesMeta": { "@acme/old": { "optional": true } },\n  "scripts": { "@acme/old": "x" }\n}\n`
    expect(renameInManifest(text, '@acme/old', '@acme/new')).toBe(`{\n  "name": "@acme/new",\n  "dependencies": {\n    "@acme/new": "workspace:*",\n    "@acme/old-two": "1.0.0"\n  },\n  "peerDependenciesMeta": { "@acme/new": { "optional": true } },\n  "scripts": { "@acme/old": "x" }\n}\n`)
  })

  it('renames keys and items of pnpm-workspace.yaml, keeping comments', () => {
    const yaml = `packages:\n  - apps/*\ncatalog:\n  # pinned\n  '@acme/old': ^1.0.0\n  '@acme/older': ^1.0.0\nminimumReleaseAgeExclude:\n  - '@acme/old@1.0.0'\n  - '@acme/old'\n`
    expect(renameInWorkspaceYaml(yaml, '@acme/old', '@acme/new')).toBe(`packages:\n  - apps/*\ncatalog:\n  # pinned\n  '@acme/new': ^1.0.0\n  '@acme/older': ^1.0.0\nminimumReleaseAgeExclude:\n  - '@acme/new@1.0.0'\n  - '@acme/new'\n`)
  })

  it('renames scoped string literals and subpaths, not longer names', () => {
    const code = `import a from '@acme/old'\nimport b from "@acme/old/api"\nconst c = await import(\`@acme/old\`)\nexport default { modules: ['@acme/old', '@acme/old-x'] }\n`
    expect(renameInSource(code, '@acme/old', '@acme/new')).toBe(`import a from '@acme/new'\nimport b from "@acme/new/api"\nconst c = await import(\`@acme/new\`)\nexport default { modules: ['@acme/new', '@acme/old-x'] }\n`)
  })

  it('renames every mention of a scoped name in Markdown', () => {
    expect(renameInMarkdown('- [@acme/old](./packages/old): see @acme/old/api, not @acme/older or x@acme/old\n', '@acme/old', '@acme/new'))
      .toBe('- [@acme/new](./packages/old): see @acme/new/api, not @acme/older or x@acme/old\n')
  })

  it('renames only import specifiers of an unscoped name', () => {
    const code = `import a from 'utils'\nexport * from 'utils/x'\nconst b = require('utils')\nconst label = 'utils'\n`
    expect(renameInSource(code, 'utils', 'helpers')).toBe(`import a from 'helpers'\nexport * from 'helpers/x'\nconst b = require('helpers')\nconst label = 'utils'\n`)
  })
})

describe('planPackageRename', () => {
  beforeEach(async () => {
    await write('pnpm-workspace.yaml', `packages:\n  - apps/*\n  - packages/*\noverrides:\n  # keep one copy\n  '@acme/old': workspace:*\n`)
    await write('package.json', json({ name: '@acme/root', private: true }))
    await write('packages/old/package.json', json({ name: '@acme/old', exports: { '.': './src/index.ts' } }))
    await write('packages/old/tsconfig.json', json({ extends: '../../tsconfig.json' }))
    await write('apps/web/package.json', json({ name: '@acme/web', dependencies: { '@acme/old': 'workspace:*' } }))
    await write('apps/web/nuxt.config.ts', `export default defineNuxtConfig({\n  modules: ['@acme/old'],\n  alias: { x: '../../packages/old/src' },\n})\n`)
    await write('apps/web/app/app.vue', `<script setup lang="ts">\nimport { thing } from '@acme/old/api'\n</script>\n`)
    await write('apps/web/node_modules/@acme/old/index.ts', `export * from '@acme/old'\n`)
    await write('pnpm-lock.yaml', `importers:\n  apps/web:\n    dependencies:\n      '@acme/old':\n`)
    await write('README.md', 'Use `@acme/old`, see [the package](./packages/old/package.json).\n')
  })

  it('renames the package and its references, but not lockfiles or node_modules', async () => {
    const { plan, newName } = await planPackageRename({ cwd: root, package: '@acme/old', name: 'new' })
    expect(newName).toBe('@acme/new')
    expect(describePlan(plan)).toEqual([
      'changed  README.md',
      'changed  apps/web/app/app.vue',
      'changed  apps/web/nuxt.config.ts',
      'changed  apps/web/package.json',
      'changed  packages/old/package.json',
      'changed  pnpm-workspace.yaml',
    ])
    await applyPlan(plan)
    expect(JSON.parse(await read('packages/old/package.json')).name).toBe('@acme/new')
    expect(JSON.parse(await read('apps/web/package.json')).dependencies).toEqual({ '@acme/new': 'workspace:*' })
    expect(await read('pnpm-workspace.yaml')).toContain(`  # keep one copy\n  '@acme/new': workspace:*`)
    expect(await read('apps/web/nuxt.config.ts')).toContain(`modules: ['@acme/new']`)
    expect(await read('pnpm-lock.yaml')).toContain('@acme/old')
    expect(await read('apps/web/node_modules/@acme/old/index.ts')).toContain('@acme/old')
  })

  it('finds the package by folder and renames the folder with --dir', async () => {
    const { plan } = await planPackageRename({ cwd: root, package: 'packages/old', name: 'new', dir: true })
    await applyPlan(plan)
    expect(existsSync(join(root, 'packages/old'))).toBe(false)
    expect(JSON.parse(await read('packages/new/package.json')).name).toBe('@acme/new')
    // same depth: its own relative paths stay, paths into it follow
    expect(JSON.parse(await read('packages/new/tsconfig.json')).extends).toBe('../../tsconfig.json')
    expect(await read('apps/web/nuxt.config.ts')).toContain(`'../../packages/new/src'`)
    expect(await read('README.md')).toBe('Use `@acme/new`, see [the package](./packages/new/package.json).\n')
  })

  it('writes nothing for a dry run', async () => {
    await planPackageRename({ cwd: root, package: '@acme/old', name: 'new' })
    expect(JSON.parse(await read('packages/old/package.json')).name).toBe('@acme/old')
  })

  it('refuses an unknown package and a taken name', async () => {
    await expect(planPackageRename({ cwd: root, package: '@acme/nope', name: 'x' })).rejects.toThrow('No workspace package')
    await expect(planPackageRename({ cwd: root, package: '@acme/old', name: 'web' })).rejects.toThrow('already named @acme/web')
  })
})

describe('relocate', () => {
  const move = { from: '/a/modules/foo.ts', to: '/a/modules/foo/index.ts', kind: 'file' as const }
  it.each([
    ['/a/modules/foo.ts', '/a/modules/foo/index.ts'],
    ['/a/modules/foo', '/a/modules/foo'],
    ['/a/modules/foo.js', '/a/modules/foo/index.js'],
    ['/a/modules/foobar.ts', undefined],
    ['/a/modules/foo.json', undefined],
  ])('%s → %s', (path, expected) => {
    expect(relocate(path, [move])).toBe(expected)
  })
})

describe('planModuleFolder', () => {
  beforeEach(async () => {
    await write('pnpm-workspace.yaml', 'packages:\n  - apps/*\n')
    await write('apps/web/package.json', json({ name: 'web' }))
    await write('apps/web/nuxt.config.ts', 'export default defineNuxtConfig({})\n')
    await write('apps/web/modules/shared.ts', 'export const shared = 1\n')
    await write('apps/web/modules/hello.ts', `import { defineNuxtModule } from '@nuxt/kit'\nimport { shared } from './shared'\nimport cfg from '../config/hello.json'\nexport default defineNuxtModule({ setup() {} })\n`)
    await write('apps/web/config/hello.json', '{}\n')
    await write('apps/web/server/x.ts', `import a from '../modules/hello'\nimport b from '../modules/hello.ts'\n`)
  })

  it('moves the file into a folder and fixes relative imports', async () => {
    const { plan, hint } = await planModuleFolder({ cwd: root, module: 'apps/web/modules/hello.ts', runtime: true })
    expect(describePlan(plan)).toEqual([
      'moved    apps/web/modules/hello.ts → apps/web/modules/hello/index.ts',
      'changed  apps/web/modules/hello/index.ts',
      'created  apps/web/modules/hello/runtime/plugin.ts',
      'changed  apps/web/server/x.ts',
    ])
    expect(hint).toContain('createResolver(import.meta.url)')
    await applyPlan(plan)
    const index = await read('apps/web/modules/hello/index.ts')
    expect(index).toContain(`from '../shared'`)
    expect(index).toContain(`from '../../config/hello.json'`)
    expect(index).toContain(`from '@nuxt/kit'`)
    expect(await read('apps/web/server/x.ts')).toBe(`import a from '../modules/hello'\nimport b from '../modules/hello/index.ts'\n`)
    expect(existsSync(join(root, 'apps/web/modules/hello/runtime/plugin.ts'))).toBe(true)
  })

  it('resolves a bare name in the app and skips the hint when there is a resolver', async () => {
    await write('apps/web/modules/hello.ts', `import { createResolver } from '@nuxt/kit'\nconst { resolve } = createResolver(import.meta.url)\n`)
    const { index, hint, plan } = await planModuleFolder({ cwd: root, module: 'hello' })
    expect(index).toBe(join(root, 'apps/web/modules/hello/index.ts'))
    expect(hint).toBeUndefined()
    expect(plan.created.size).toBe(0)
  })

  it('refuses when the folder exists, or the module is a folder already', async () => {
    await mkdir(join(root, 'apps/web/modules/hello'))
    await expect(planModuleFolder({ cwd: root, module: 'apps/web/modules/hello.ts' })).rejects.toThrow('already exists')
    await write('apps/web/modules/other/index.ts', '')
    await expect(planModuleFolder({ cwd: root, module: 'apps/web/modules/other' })).rejects.toThrow('already a folder')
  })
})

describe('planModuleMove', () => {
  beforeEach(async () => {
    await write('pnpm-workspace.yaml', 'packages:\n  - apps/*\n  - packages/*\n')
    await write('tsconfig.json', '{}\n')
    await write('apps/web/package.json', json({ name: 'web', dependencies: { 'some-lib': '1.0.0' } }))
    await write('apps/web/nuxt.config.ts', `export default defineNuxtConfig({ extends: ['../../layers/base'] })\n`)
    await write('apps/web/utils/x.ts', 'export const x = 1\n')
    await write('apps/web/modules/hello/index.ts', `import lib from 'some-lib'\nimport { x } from '../../utils/x'\nimport { y } from './runtime/y'\nexport const r = '~~/utils/x'\n`)
    await write('apps/web/modules/hello/runtime/y.ts', 'export const y = 1\n')
    await write('apps/web/modules/solo.ts', `import { x } from '../utils/x'\n`)
    await write('apps/web/server/use.ts', `import h from '../modules/hello'\n`)
    await write('apps/admin/package.json', json({ name: 'admin' }))
    await write('apps/admin/nuxt.config.ts', 'export default defineNuxtConfig({})\n')
    await write('layers/base/package.json', json({ name: 'base' }))
    await write('layers/base/nuxt.config.ts', 'export default defineNuxtConfig({})\n')
    await write('layers/base/tsconfig.json', json({ extends: '../../tsconfig.json' }))
  })

  it('moves a folder module to another app and fixes paths both ways', async () => {
    const { plan } = await planModuleMove({ cwd: root, module: 'apps/web/modules/hello', destination: 'apps/admin' })
    expect(plan.warnings.join('\n')).toContain('lacks some-lib')
    expect(plan.warnings.join('\n')).toContain('`~~/utils/x` now resolves against apps/admin')
    await applyPlan(plan)
    const index = await read('apps/admin/modules/hello/index.ts')
    expect(index).toContain(`from '../../../web/utils/x'`)
    expect(index).toContain(`from './runtime/y'`)
    expect(await read('apps/web/server/use.ts')).toBe(`import h from '../../admin/modules/hello'\n`)
  })

  it('moves and renames a file module with --name', async () => {
    const { plan } = await planModuleMove({ cwd: root, module: 'solo', app: 'web', destination: 'apps/admin/modules', name: 'single' })
    await applyPlan(plan)
    expect(await read('apps/admin/modules/single.ts')).toBe(`import { x } from '../../web/utils/x'\n`)
  })

  it('moves a package folder, fixes its config paths and warns outside the workspace globs', async () => {
    const { plan } = await planModuleMove({ cwd: root, module: 'layers/base', destination: 'packages/layers' })
    expect(plan.warnings.join('\n')).toContain('packages/layers/base is not matched')
    await applyPlan(plan)
    expect(JSON.parse(await read('packages/layers/base/tsconfig.json')).extends).toBe('../../../tsconfig.json')
    expect(await read('apps/web/nuxt.config.ts')).toContain(`extends: ['../../packages/layers/base']`)
  })

  it('refuses to overwrite', async () => {
    await write('apps/admin/modules/hello/index.ts', '')
    await expect(planModuleMove({ cwd: root, module: 'apps/web/modules/hello', destination: 'apps/admin' })).rejects.toThrow('already exists')
  })
})

describe('module:move helpers', () => {
  it('matches workspace globs', () => {
    expect(matchesWorkspaceGlobs('apps/web', ['apps/*'])).toBe(true)
    expect(matchesWorkspaceGlobs('apps/web/x', ['apps/*'])).toBe(false)
    expect(matchesWorkspaceGlobs('packages/a/b', ['packages/**'])).toBe(true)
    expect(matchesWorkspaceGlobs('layers/x', ['apps/*', 'packages/**'])).toBe(false)
  })

  it('lists imported packages', () => {
    expect([...importedPackages(`import a from '@nuxt/kit'\nimport b from 'defu/x'\nimport c from './c'\nimport d from '#imports'\nimport e from 'node:fs'\nimport f from '~/f'\n`)])
      .toEqual(['@nuxt/kit', 'defu'])
  })
})
