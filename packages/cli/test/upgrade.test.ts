import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { upgradeWorkspace } from '../src/commands/upgrade.ts'
import { duplicateVersions, findPins, movePatchedDependencies, sharedDuplicates, rewritePins, workspaceGlobs } from '../src/upgrade/manifests.ts'
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

describe('lockfile', () => {
  it('finds @frigear-nu packages installed in more than one version', () => {
    const lock = [
      'packages:',
      '  \'@frigear-nu/auth@0.6.0\':',
      '  \'@frigear-nu/auth@0.6.1\':',
      '  \'@frigear-nu/users@3.1.0\':',
      'snapshots:',
      '  \'@frigear-nu/auth@0.6.1(nuxt@4.6.4)\':',
      '  \'@frigear-nu/users@3.1.0(@frigear-nu/auth@0.6.0)\':',
    ].join('\n')
    expect(duplicateVersions(lock)).toEqual({ '@frigear-nu/auth': ['0.6.0', '0.6.1'] })
  })

  it('finds shared libraries installed in two versions of one major', () => {
    const lock = [
      'packages:',
      '  zod@3.25.76:',
      '  zod@4.6.5:',
      '  zod@4.6.7:',
      '  h3@1.15.11:',
      '  vue@3.5.0:',
      'snapshots:',
      '  zod@4.6.7: {}',
    ].join('\n')
    expect(sharedDuplicates(lock)).toEqual({ zod: ['4.6.5', '4.6.7'] })
  })
})

describe('movePatchedDependencies', () => {
  it('moves yaml and package.json patch entries to the new version', () => {
    const yaml = 'patchedDependencies:\n  \'@frigear-nu/mobile@0.6.0\': patches/@frigear-nu__mobile@0.6.0.patch\n  vue@3.5.0: patches/vue.patch\n'
    const moved = movePatchedDependencies('pnpm-workspace.yaml', yaml, { '@frigear-nu/mobile': '0.6.1' })
    expect(moved.text).toBe('patchedDependencies:\n  \'@frigear-nu/mobile@0.6.1\': patches/@frigear-nu__mobile@0.6.1.patch\n  vue@3.5.0: patches/vue.patch\n')
    expect(moved.moves).toEqual([{ file: 'pnpm-workspace.yaml', name: '@frigear-nu/mobile', from: '0.6.0', to: '0.6.1', patch: 'patches/@frigear-nu__mobile@0.6.0.patch', next: 'patches/@frigear-nu__mobile@0.6.1.patch' }])
    const json = '{ "pnpm": { "patchedDependencies": {\n    "@frigear-nu/mobile@0.6.0": "patches/mobile.patch"\n  } } }'
    expect(movePatchedDependencies('package.json', json, { '@frigear-nu/mobile': '0.6.1' }).text).toContain('"@frigear-nu/mobile@0.6.1": "patches/mobile.patch"')
    expect(movePatchedDependencies('package.json', json, {}).moves).toEqual([])
  })
})

describe('addAppSecret', () => {
  it('goes right after NUXT_SESSION_PASSWORD', () => {
    expect(addAppSecret('A=1\nNUXT_SESSION_PASSWORD=\nB=2\n')).toBe('A=1\nNUXT_SESSION_PASSWORD=\n# Seals the session cookie (32+ random characters).\nNUXT_APP_SECRET=\nB=2\n')
  })
  it('goes at the end otherwise', () => {
    expect(addAppSecret('A=1')).toBe('A=1\n# Seals the session cookie (32+ random characters).\nNUXT_APP_SECRET=\n')
  })
})

describe('pendingMigrations', () => {
  it('picks the changes released after the current version, up to the target', () => {
    const ids = (from: string, to: string) => pendingMigrations(migrations, { '@frigear-nu/auth': from }, { '@frigear-nu/auth': to }).map(m => m.id)
    expect(ids('0.1.2', '0.6.1')).toEqual(['auth-routes', 'auth-api', 'auth-session-secret', 'auth-permissions'])
    expect(ids('0.3.4', '0.6.1')).toEqual(['auth-session-secret', 'auth-permissions'])
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
    expect(await read('apps/web/.env.example')).toContain('NUXT_APP_SECRET=')
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

  it('adds NUXT_APP_SECRET only to apps with server sessions', async () => {
    await write('apps/site/package.json', '{ "dependencies": { "@frigear-nu/cookie-consent": "0.2.4" } }\n')
    await write('apps/site/nuxt.config.ts', 'export default defineNuxtConfig({ modules: [\'@frigear-nu/cookie-consent\'] })\n')
    await write('apps/site/.env.example', 'NUXT_PUBLIC_SITE_URL=\n')
    await write('apps/mobile/package.json', '{ "dependencies": { "@frigear-nu/auth": "0.3.4" } }\n')
    await write('apps/mobile/nuxt.config.ts', 'export default defineNuxtConfig({ ssr: false })\n')
    await write('apps/mobile/.env.example', 'NUXT_PUBLIC_API=\n')
    await upgradeWorkspace({ cwd: root, resolveLatest })
    expect(await read('apps/web/.env.example')).toBe('NUXT_SESSION_PASSWORD=\n# Seals the session cookie (32+ random characters).\nNUXT_APP_SECRET=\n')
    expect(await read('apps/site/.env.example')).not.toContain('NUXT_APP_SECRET')
    expect(await read('apps/mobile/.env.example')).not.toContain('NUXT_APP_SECRET')
  })

  it('lists stored roles, role checks and admin allowlists', async () => {
    await write('apps/web/package.json', '{ "dependencies": { "@frigear-nu/auth": "0.3.4", "@frigear-nu/authorization": "0.3.2" } }\n')
    await write('apps/web/nuxt.config.ts', [
      'export default defineNuxtConfig({',
      '  authentication: { settings: { session: { mapper: \'./server/utils/map-session-user\' } } },',
      '  runtimeConfig: { session: { password: \'\' } },',
      '})',
      '',
    ].join('\n'))
    await write('apps/web/server/utils/acl.ts', [
      'export const effectiveRole = (user: { email: string, role: string }) =>',
      '  useRuntimeConfig().aclAdmins.includes(user.email) ? \'admin\' : user.role',
      '',
    ].join('\n'))
    await write('apps/web/server/tasks/db/seed.ts', [
      'export default defineTask({ run: () => db.insert(users).values({ email: \'a@b.c\', role: \'admin\' }) })',
      '',
    ].join('\n'))
    await write('apps/web/server/plugins/roles.ts', 'nitro.hooks.hook(\'authorization:roles\', (ctx) => { if (aclAdmins.includes(ctx.user.email)) ctx.roles.push(\'admin\') })\n')
    await write('apps/web/app/components/AdminLink.vue', '<template><a v-if="currentUser?.role === \'admin\'">Admin</a></template>\n')
    const { report } = await upgradeWorkspace({ cwd: root, resolveLatest: async name => ({ ...latest, '@frigear-nu/authorization': '0.6.0' })[name], dryRun: true })
    expect(report).toContain('apps/web/server/utils/acl.ts:1')
    expect(report).toContain('apps/web/server/utils/acl.ts:2')
    expect(report).toContain('apps/web/server/tasks/db/seed.ts:1')
    expect(report).toContain('apps/web/app/components/AdminLink.vue:1')
    expect(report).not.toContain('apps/web/server/plugins/roles.ts')
    expect(report).toContain('`authentication.settings.session.mapper` is set')
    expect(report).toContain('`runtimeConfig.session.password` is no longer read')
    expect(report).toContain('Roles add up')
  })

  it('lists app plugins and composables that clash with auth\'s $api and useApi', async () => {
    await write('apps/web/package.json', '{ "dependencies": { "@frigear-nu/auth": "0.1.2" } }\n')
    await write('apps/web/app/plugins/api.ts', 'export default defineNuxtPlugin(() => ({ provide: { api: $fetch.create({}) } }))\n')
    await write('apps/web/app/composables/useApi.ts', 'export const useApi = () => useNuxtApp().$api\n')
    await write('apps/web/server/plugins/api.ts', 'export default defineNitroPlugin(() => ({ provide: { api: 1 } }))\n')
    const { report } = await upgradeWorkspace({ cwd: root, resolveLatest: async name => latest[name], dryRun: true })
    expect(report).toContain('apps/web/app/plugins/api.ts:1')
    expect(report).toContain('apps/web/app/composables/useApi.ts:1')
    expect(report).not.toContain('apps/web/server/plugins/api.ts')
  })

  it('lists links to /account/tickets and a tickets page that moves into the dashboard hub', async () => {
    await write('apps/web/package.json', '{ "dependencies": { "@frigear-nu/events": "0.5.0" } }\n')
    await write('apps/web/nuxt.config.ts', [
      'export default defineNuxtConfig({',
      '  modules: [\'@frigear-nu/events\', \'@frigear-nu/dashboard\'],',
      '  events: { settings: { pages: { tickets: true } } },',
      '})',
      '',
    ].join('\n'))
    await write('apps/web/app/components/TicketsLink.vue', '<template><ULink to="/account/tickets">Tickets</ULink></template>\n')
    await write('apps/site/package.json', '{ "dependencies": { "@frigear-nu/events": "0.5.0" } }\n')
    await write('apps/site/nuxt.config.ts', 'export default defineNuxtConfig({ modules: [\'@frigear-nu/events\'], events: { settings: { pages: { tickets: true } } } })\n')
    const { report } = await upgradeWorkspace({ cwd: root, resolveLatest: async name => ({ ...latest, '@frigear-nu/events': '0.6.0' })[name], dryRun: true })
    expect(report).toContain('The tickets page moved to /dashboard/tickets')
    expect(report).toContain('apps/web/app/components/TicketsLink.vue:1')
    expect(report).toContain('apps/web/nuxt.config.ts: `events.settings.pages.tickets: true` is `/dashboard/tickets` now')
    // Without the dashboard the page stays in the account.
    expect(report).not.toContain('apps/site/nuxt.config.ts')
    // A dry run lists, it never rewrites (and this rule only lists).
    expect(await read('apps/web/app/components/TicketsLink.vue')).toContain('/account/tickets')
  })

  it('moves patched dependencies and their patch files', async () => {
    await write('pnpm-workspace.yaml', 'packages:\n  - \'apps/*\'\npatchedDependencies:\n  \'@frigear-nu/auth@0.5.0\': patches/@frigear-nu__auth@0.5.0.patch\n')
    await write('patches/@frigear-nu__auth@0.5.0.patch', 'diff\n')
    await write('apps/web/package.json', '{ "dependencies": { "@frigear-nu/auth": "0.5.0" } }\n')
    const { report } = await upgradeWorkspace({ cwd: root, resolveLatest: async name => latest[name] })
    expect(await read('pnpm-workspace.yaml')).toContain(`'@frigear-nu/auth@${latest['@frigear-nu/auth']}': patches/@frigear-nu__auth@${latest['@frigear-nu/auth']}.patch`)
    expect(await read(`patches/@frigear-nu__auth@${latest['@frigear-nu/auth']}.patch`)).toBe('diff\n')
    expect(report).toContain('## Patched packages')
  })

  it('changes nothing on a dry run', async () => {
    const before = await read('apps/web/package.json')
    const result = await upgradeWorkspace({ cwd: root, resolveLatest, dryRun: true })
    expect(result.bumps.length).toBeGreaterThan(0)
    expect(await read('apps/web/package.json')).toBe(before)
    expect(await read('apps/web/.env.example')).not.toContain('NUXT_APP_SECRET')
    expect(result.report).toContain('(dry run)')
  })

  it('never downgrades', async () => {
    const result = await upgradeWorkspace({ cwd: root, resolveLatest, to: { '@frigear-nu/auth': '0.2.0' } })
    expect(result.skipped).toEqual(['@frigear-nu/auth: pinned 0.3.4 is newer than 0.2.0'])
    expect(JSON.parse(await read('apps/web/package.json')).dependencies['@frigear-nu/auth']).toBe('0.3.4')
  })
})
