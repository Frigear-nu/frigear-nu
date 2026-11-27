import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveStarter } from '../src/commands/init.ts'
import { freePackageName, resolveAppsDir, toPackageName } from '../src/utils/workspace.ts'

describe('freePackageName', () => {
  it('keeps a free name and adds -app, then a number, to a taken one', () => {
    expect(freePackageName('@a/mobile', new Set(['@a/web']))).toBe('@a/mobile')
    expect(freePackageName('@a/mobile', new Set(['@a/mobile']))).toBe('@a/mobile-app')
    expect(freePackageName('@a/mobile', new Set(['@a/mobile', '@a/mobile-app']))).toBe('@a/mobile-app-2')
  })
})

describe('toPackageName', () => {
  it.each([
    ['My App', 'my-app'],
    ['my app', 'my-app'],
    ['myApp', 'my-app'],
    ['my-app', 'my-app'],
    ['  Shop & Blog!  ', 'shop-blog'],
  ])('%s → %s', (input, expected) => {
    expect(toPackageName(input)).toBe(expected)
  })
})

describe('resolveStarter', () => {
  it.each([
    ['web', 'workspace'],
    ['mobile', 'mobile'],
    ['web,mobile', 'mobile-standalone'],
    ['Mobile, Web', 'mobile-standalone'],
    ['workspace', 'workspace'],
    ['mobile-standalone', 'mobile-standalone'],
    ['desktop', 'desktop'],
    ['Desktop', 'desktop'],
    ['desktop,mobile', undefined],
    ['web,desktop', undefined],
    ['web,mobile,desktop', 'multi-platform'],
    ['Desktop, web, MOBILE', 'multi-platform'],
    ['multi-platform', 'multi-platform'],
    ['tv', undefined],
    ['', undefined],
  ])('%s → %s', (input, expected) => {
    expect(resolveStarter(input)).toBe(expected)
  })
})

describe('resolveAppsDir', () => {
  const setup = async (yaml: string) => {
    const root = await mkdtemp(join(tmpdir(), 'frigear-apps-dir-'))
    await writeFile(join(root, 'pnpm-workspace.yaml'), yaml)
    return root
  }

  it('uses apps/ from the root and from inside an app', async () => {
    const root = await setup('packages:\n  - apps/*\n  - packages/*\n')
    expect(await resolveAppsDir({ cwd: root, root })).toEqual({ dir: join(root, 'apps'), covered: true })
    expect((await resolveAppsDir({ cwd: join(root, 'apps/web/src'), root })).dir).toBe(join(root, 'apps'))
  })

  it('uses the apps folder it is run from, also a custom one', async () => {
    const root = await setup('packages:\n  - "apps/*"\n  - "devices/*"\n  - "packages/*"\n')
    expect((await resolveAppsDir({ cwd: join(root, 'devices'), root })).dir).toBe(join(root, 'devices'))
    expect((await resolveAppsDir({ cwd: join(root, 'packages/ui'), root })).dir).toBe(join(root, 'apps'))
  })

  it('falls back to the first other glob without apps/*', async () => {
    const root = await setup('packages:\n  - projects/*\n  - packages/*\n')
    expect((await resolveAppsDir({ cwd: root, root })).dir).toBe(join(root, 'projects'))
  })

  it('takes an explicit folder, flags one pnpm does not cover, and refuses one outside the root', async () => {
    const root = await setup('packages:\n  - apps/*\n')
    expect(await resolveAppsDir({ cwd: root, root, appsDir: 'clients' })).toEqual({ dir: join(root, 'clients'), covered: false })
    await expect(resolveAppsDir({ cwd: root, root, appsDir: '../elsewhere' })).rejects.toMatchObject({ code: 'OUTSIDE_ROOT' })
  })
})
