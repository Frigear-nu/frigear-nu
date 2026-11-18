import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installAfterUpgrade, upgradeWorkspace } from '../src/commands/upgrade.ts'
import { findPins, rewritePins, workspaceGlobs } from '../src/upgrade/manifests.ts'
import { pendingMigrations } from '../src/upgrade/migrate.ts'
import { compareVersions, rewriteRange } from '../src/upgrade/versions.ts'
import { migrations } from '../src/upgrades/index.ts'
import { addAppSecret } from '../src/upgrades/session.ts'

describe('versions', () => {
  it('compares versions, a pre-release before its release', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBeLessThan(0)
    expect(compareVersions('3.1.0', '3.1.0')).toBe(0)
  })

  it('moves a range to a version, keeping its operator', () => {
    expect(rewriteRange('0.3.4', '0.6.1')).toBe('0.6.1')
    expect(rewriteRange('^0.5.1', '0.6.1')).toBe('^0.6.1')
    expect(rewriteRange('>=0.3.4', '0.6.1')).toBe('>=0.6.1')
    expect(rewriteRange('>0.3.4', '0.6.1')).toBe('>=0.6.1')
    expect(rewriteRange('~1.3.4', '1.3.5')).toBe('~1.3.5')
  })

  it('leaves workspace, catalog and complex ranges alone', () => {
    for (const range of ['workspace:*', 'workspace:^', 'catalog:', 'latest', '*', '^1.0.0 || ^2.0.0', 'false', '0.6.1']) {
      expect(rewriteRange(range, '0.6.1')).toBeUndefined()
    }
  })
})

describe('manifests', () => {
  const yaml = [
    'packages:',
    '  - \'apps/*\'',
    '  - packages/*',
    '  - \'!packages/eslint-config/.example\'',
    'allowBuilds:',
    '  \'@frigear-nu/auth\': false',
    'catalog:',
    '  \'@frigear-nu/ui\': ^0.2.5 # shared',
    'overrides:',
    '  "@frigear-nu/module-kit": ^1.3.4',
    'minimumReleaseAgeExclude:',
    '  - \'@frigear-nu/auth@0.3.4\'',
    '  - \'@frigear-nu/users\'',
    '',
  ].join('\n')

  it('reads the workspace globs without negations', () => {
    expect(workspaceGlobs(yaml)).toEqual(['apps/*', 'packages/*'])
  })

  it('rewrites pnpm-workspace.yaml pins and keeps comments, flags and bare names', () => {
    const { text, bumps } = rewritePins('pnpm-workspace.yaml', yaml, {
      '@frigear-nu/auth': '0.6.1',
      '@frigear-nu/ui': '0.2.6',
      '@frigear-nu/module-kit': '1.3.5',
      '@frigear-nu/users': '3.1.0',
    })
    expect(text).toContain('  \'@frigear-nu/auth\': false')
    expect(text).toContain('  \'@frigear-nu/ui\': ^0.2.6 # shared')
    expect(text).toContain('  "@frigear-nu/module-kit": ^1.3.5')
    expect(text).toContain('  - \'@frigear-nu/auth@0.6.1\'')
    expect(text).toContain('  - \'@frigear-nu/users\'')
    expect(bumps.map(bump => bump.name).sort()).toEqual(['@frigear-nu/auth', '@frigear-nu/module-kit', '@frigear-nu/ui'])
  })

  it('finds the pins of a package.json', () => {
    const json = '{ "name": "@frigear-nu/inventory-web", "dependencies": { "@frigear-nu/auth": "0.1.2", "@frigear-nu/inventory-schema": "workspace:*" } }'
    expect(findPins('package.json', json)).toEqual([
      { file: 'package.json', name: '@frigear-nu/auth', range: '0.1.2' },
      { file: 'package.json', name: '@frigear-nu/inventory-schema', range: 'workspace:*' },
    ])
  })
})

describe('addAppSecret', () => {
  it('puts a placeholder secret above NUXT_SESSION_PASSWORD and the comment describing it', () => {
    const text = addAppSecret('NUXT_PUBLIC_SITE_URL=http://localhost:3000\n\n# Encrypts stored tokens\nNUXT_SESSION_PASSWORD=some-very-long-password\n')
    const lines = text.split('\n')
    const secret = lines.findIndex(line => line.startsWith('NUXT_APP_SECRET='))
    expect(lines[secret]!.slice('NUXT_APP_SECRET='.length).length).toBeGreaterThanOrEqual(32)
    expect(lines[secret - 1]).toMatch(/^#/)
    expect(lines.slice(secret + 1)).toEqual(['# Encrypts stored tokens', 'NUXT_SESSION_PASSWORD=some-very-long-password', ''])
    expect(lines[0]).toBe('NUXT_PUBLIC_SITE_URL=http://localhost:3000')
  })

  it('appends it when there is no NUXT_SESSION_PASSWORD', () => {
    const text = addAppSecret('NUXT_PUBLIC_SITE_URL=http://localhost:3000')
    expect(text.startsWith('NUXT_PUBLIC_SITE_URL=http://localhost:3000\n#')).toBe(true)
    expect(text).toMatch(/\nNUXT_APP_SECRET=.{32,}\n$/)
  })
})

describe('installAfterUpgrade', () => {
  const logger = () => {
    const calls: Record<'start' | 'success' | 'warn', string[]> = { start: [], success: [], warn: [] }
    return {
      calls,
      start: (message: string) => void calls.start.push(message),
      success: (message: string) => void calls.success.push(message),
      warn: (message: string) => void calls.warn.push(message),
    }
  }

  it('warns with the report path instead of throwing when the install fails', async () => {
    const log = logger()
    const failing = async () => {
      throw new Error('Command failed with exit code 1: pnpm install\n    at stack frame')
    }
    expect(await installAfterUpgrade('/ws', '/ws/frigear-upgrade.md', log as never, failing)).toBe(false)
    expect(log.calls.warn).toHaveLength(1)
    expect(log.calls.warn[0]).toContain('/ws/frigear-upgrade.md')
    expect(log.calls.warn[0]).toContain('expected until the to-do items are done')
    expect(log.calls.warn[0]).not.toContain('at stack frame')
  })

  it('answers true after an install that succeeds', async () => {
    const log = logger()
    expect(await installAfterUpgrade('/ws', '/ws/frigear-upgrade.md', log as never, async () => {})).toBe(true)
    expect(log.calls.warn).toEqual([])
  })
})

describe('pendingMigrations', () => {
  it('picks the changes released after the current version, up to the target', () => {
    const ids = (from: string, to: string) => pendingMigrations(migrations, { '@frigear-nu/auth': from }, { '@frigear-nu/auth': to }).map(m => m.id)
    const roles = ['auth-role-allowlist', 'auth-role-column', 'auth-additive-roles']
    expect(ids('0.1.2', '0.6.1')).toEqual(['auth-routes', 'auth-session-secret', 'auth-permissions', ...roles])
    expect(ids('0.3.4', '0.6.1')).toEqual(['auth-session-secret', 'auth-permissions', ...roles])
    expect(ids('0.5.0', '0.6.1')).toEqual([])
  })
})

describe('upgradeWorkspace', () => {
  let root: string
  const write = async (path: string, text: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), text)
  }
  const read = (path: string) => readFile(join(root, path), 'utf-8')
  const latest: Record<string, string> = {
    '@frigear-nu/auth': '0.6.1',
    '@frigear-nu/users': '3.1.0',
    '@frigear-nu/admin': '0.5.0',
    '@frigear-nu/module-kit': '1.3.5',
  }
  const resolveLatest = async (name: string) => latest[name]

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'frigear-upgrade-'))
    await write('pnpm-workspace.yaml', [
      'packages:',
      '  - \'apps/*\'',
      '  - \'packages/*\'',
      'allowBuilds:',
      '  \'@frigear-nu/auth\': false',
      'minimumReleaseAgeExclude:',
      '  - \'@frigear-nu/auth@0.3.4\'',
      '  - \'@frigear-nu/users@1.3.0\'',
      '',
    ].join('\n'))
    await write('package.json', '{ "name": "root", "private": true }\n')
    await write('apps/web/package.json', `${JSON.stringify({
      name: 'web',
      dependencies: {
        '@frigear-nu/admin': '0.2.5',
        '@frigear-nu/auth': '0.3.4',
        '@frigear-nu/users': '1.3.0',
        '@frigear-nu/teams': 'workspace:*',
      },
    }, null, 2)}\n`)
    await write('packages/teams/package.json', `${JSON.stringify({
      name: '@frigear-nu/teams',
      dependencies: { '@frigear-nu/module-kit': '1.3.4' },
      peerDependencies: { '@frigear-nu/auth': '>=0.3.4' },
    }, null, 2)}\n`)
    await write('apps/web/.env.example', 'NUXT_SESSION_PASSWORD=\n')
    await write('apps/web/nuxt.config.ts', [
      'export default defineNuxtConfig({',
      '  modules: [\'@frigear-nu/auth\', \'@frigear-nu/admin\'],',
      '  authentication: { scopes: [{ name: \'teams:read\' }] },',
      '  admin: { settings: { roles: [\'admin\'] } },',
      '})',
      '',
    ].join('\n'))
    await write('apps/web/server/api/teams.get.ts', [
      'export default defineEventHandler(async (event) => {',
      '  const user = await requireUser(event, { scopes: [\'teams:read\'] })',
      '  return $fetch(\'/api/auth/tokens\')',
      '})',
      'nitro.hooks.hook(\'teams:authorize\', () => {})',
      '',
    ].join('\n'))
    await write('apps/web/node_modules/@frigear-nu/auth/index.js', 'requireUser(event, { scopes })\n')
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('bumps every pin and lists the rest in the report', async () => {
    const result = await upgradeWorkspace({ cwd: join(root, 'apps/web'), resolveLatest })
    expect(result.from).toEqual({
      '@frigear-nu/admin': '0.2.5',
      '@frigear-nu/auth': '0.3.4',
      '@frigear-nu/module-kit': '1.3.4',
      '@frigear-nu/users': '1.3.0',
    })

    const web = JSON.parse(await read('apps/web/package.json'))
    expect(web.dependencies).toEqual({
      '@frigear-nu/admin': '0.5.0',
      '@frigear-nu/auth': '0.6.1',
      '@frigear-nu/users': '3.1.0',
      '@frigear-nu/teams': 'workspace:*',
    })
    const teams = JSON.parse(await read('packages/teams/package.json'))
    expect(teams.dependencies['@frigear-nu/module-kit']).toBe('1.3.5')
    expect(teams.peerDependencies['@frigear-nu/auth']).toBe('>=0.6.1')
    const yaml = await read('pnpm-workspace.yaml')
    expect(yaml).toContain('- \'@frigear-nu/auth@0.6.1\'')
    expect(yaml).toContain('- \'@frigear-nu/users@3.1.0\'')
    expect(yaml).toContain('\'@frigear-nu/auth\': false')

    // auth 0.3.4 already had the /api/auth/me routes: no rewrite of the route file
    expect(await read('apps/web/server/api/teams.get.ts')).toContain('/api/auth/tokens')
    expect(await read('apps/web/.env.example')).toMatch(/^# Seals the session cookie[^\n]*\n#[^\n]*\nNUXT_APP_SECRET=.{32,}\nNUXT_SESSION_PASSWORD=\n$/)
    // dependencies are never touched
    expect(await read('apps/web/node_modules/@frigear-nu/auth/index.js')).toBe('requireUser(event, { scopes })\n')

    expect(result.report).toContain('apps/web/server/api/teams.get.ts:2')
    expect(result.report).toContain('apps/web/server/api/teams.get.ts:5')
    expect(result.report).toContain('`authentication.scopes` is ignored')
    expect(result.report).toContain('`admin.settings.roles` throws at build time')
    expect(result.report).toContain('Mint API tokens again')
    expect(result.report).toContain('these releases changed the schema')
  })

  it('rewrites the moved routes when coming from before they moved', async () => {
    await write('apps/web/package.json', '{ "dependencies": { "@frigear-nu/auth": "0.1.2" } }\n')
    await write('pnpm-workspace.yaml', 'packages:\n  - \'apps/*\'\n')
    const result = await upgradeWorkspace({ cwd: root, resolveLatest, only: ['@frigear-nu/auth'] })
    expect(await read('apps/web/server/api/teams.get.ts')).toContain('$fetch(\'/api/auth/me/tokens\')')
    expect(result.report).toContain('## Rewritten')
  })

  it('changes nothing on a dry run', async () => {
    const before = await read('apps/web/package.json')
    const result = await upgradeWorkspace({ cwd: root, resolveLatest, dryRun: true })
    expect(result.bumps.length).toBeGreaterThan(0)
    expect(await read('apps/web/package.json')).toBe(before)
    expect(await read('apps/web/.env.example')).not.toContain('NUXT_APP_SECRET')
    expect(result.report).toContain('(dry run)')
  })

  it('lists the admin allowlist, the users.role reads and writes, and additive roles', async () => {
    await write('apps/web/nuxt.config.ts', [
      'export default defineNuxtConfig({',
      '  modules: [\'@frigear-nu/auth\'],',
      '  runtimeConfig: { aclAdmins: \'\' },',
      '  authentication: { settings: { session: { mapper: \'~~/server/utils/session-mapper\' } } },',
      '  routeRules: { \'/portal/**\': { roles: [\'tenant\'] }, \'/admin/**\': { roles: [\'admin\', \'manager\'] } },',
      '})',
      '',
    ].join('\n'))
    await write('apps/web/server/utils/session-mapper.ts', [
      'export default (user: { email: string }) => ({ ...user, role: effectiveRole(user) })',
      '',
    ].join('\n'))
    await write('apps/web/server/utils/acl.ts', [
      'export const effectiveRole = (user: { email: string, role: string }) =>',
      '  useRuntimeConfig().aclAdmins.split(\',\').includes(user.email) ? \'admin\' : user.role',
      'export const userHasRole = (user: { role: string }, role: string) => user.role === role',
      '',
    ].join('\n'))
    await write('apps/web/app/pages/portal.vue', [
      '<script setup lang="ts">',
      'const { user } = useUserSession()',
      'const isTenant = computed(() => user.value?.role === \'tenant\')',
      '</script>',
      '',
    ].join('\n'))
    await write('apps/web/server/tasks/seed.ts', [
      'export default defineTask({ async run() {',
      '  await db.insert(schema.users).values({ email: \'t@example.com\', name: \'Tenant\', role })',
      '  await db.update(schema.users).set({ role: \'admin\' }).where(eq(schema.users.id, 1))',
      '} })',
      '',
    ].join('\n'))

    const { report } = await upgradeWorkspace({ cwd: root, resolveLatest, only: ['@frigear-nu/auth'] })
    const section = (title: string) => report.split('### ').find(part => part.startsWith(title)) ?? ''

    const allowlist = section('An admin allowlist becomes an authorization:roles listener')
    expect(allowlist).toContain('apps/web/server/utils/acl.ts:1')
    expect(allowlist).toContain('apps/web/server/utils/acl.ts:2')
    expect(allowlist).toContain('apps/web/nuxt.config.ts:3')
    expect(allowlist).toContain('apps/web/server/utils/session-mapper.ts: the session mapper')
    expect(allowlist).toContain('#move-an-allowlist-to-authorizationroles')
    expect(allowlist).toContain('drop the session mapper that sets `role`')

    const column = section('users.role is no longer read or written')
    expect(column.match(/acl\.ts:3\b/g)).toHaveLength(1)
    expect(column).toContain('apps/web/app/pages/portal.vue:3')
    expect(column).toContain('apps/web/server/tasks/seed.ts:2')
    expect(column).toContain('apps/web/server/tasks/seed.ts:3')
    expect(column).toContain('never read again')
    expect(column).toContain('setAuthUserRoles(userId, roles, { source: \'manual\' })')
    expect(column).toContain('useAuthorization().can')

    const additive = section('Roles add up')
    expect(additive).toContain('`admin`, `manager`, `tenant`')
    expect(additive).toContain('authorization:roles')
  })

  it('does not warn about additive roles when the app checks a single role', async () => {
    const { report } = await upgradeWorkspace({ cwd: root, resolveLatest, only: ['@frigear-nu/auth'] })
    expect(report).not.toContain('Roles add up')
    expect(report).not.toContain('An admin allowlist')
  })

  it('never downgrades', async () => {
    const result = await upgradeWorkspace({ cwd: root, resolveLatest, to: { '@frigear-nu/auth': '0.2.0' } })
    expect(result.skipped).toEqual(['@frigear-nu/auth: pinned 0.3.4 is newer than 0.2.0'])
    expect(JSON.parse(await read('apps/web/package.json')).dependencies['@frigear-nu/auth']).toBe('0.3.4')
  })
})
