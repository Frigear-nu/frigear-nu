import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Nuxt } from '@nuxt/schema'
import { defineAccess, defineRoles } from '../../src/runtime/access'
import { registerAccess } from '../../src/runtime/utils/build'
import { accessTypes, compileAccess } from '../../src/runtime/utils/access-compile'
import type { PermissionDefinition, ScopeDefinition } from '../../src/runtime/utils/permissions'
import type { RoleRegistration } from '../../src/runtime/utils/access-compile'

const eventsAccess = defineAccess('events', {
  permissions: {
    'manage': { label: 'Manage events', grantTo: ['admin', 'eventmanager'] },
    'pii': { label: 'See attendees', sensitive: true, labelKey: 'custom.pii' },
    'tickets:read': { label: 'Read your tickets', implicit: true },
  },
  scopes: {
    tickets: { label: 'Your tickets', permissions: ['tickets:read'] },
  },
  roles: {
    eventmanager: { label: 'Event manager', grant: ['events:manage'] },
  },
})

/** A stand-in for `nuxt` that runs the registration hooks the way auth does at `modules:done`. */
function fakeNuxt() {
  const hooks: Record<string, Array<(list: unknown[]) => void>> = {}
  const nuxt = { hook: (name: string, fn: (list: unknown[]) => void) => (hooks[name] ??= []).push(fn) } as unknown as Nuxt
  const collect = <T>(name: string): T[] => {
    const list: T[] = []
    for (const fn of hooks[name] ?? []) fn(list)
    return list
  }
  return {
    nuxt,
    permissions: () => collect<PermissionDefinition>('auth:permissions'),
    scopes: () => collect<ScopeDefinition>('auth:named-scopes'),
    roles: () => collect<RoleRegistration>('auth:role-definitions'),
  }
}

describe('defineAccess', () => {
  it('names permissions `<resource>:<key>` and keeps keys that are full names', () => {
    expect(eventsAccess.permissions).toEqual({ 'manage': 'events:manage', 'pii': 'events:pii', 'tickets:read': 'tickets:read' })
    expect(eventsAccess.scopes).toEqual({ tickets: 'tickets' })
    expect(eventsAccess.roles).toEqual({ eventmanager: 'eventmanager' })
    expect(eventsAccess.resource).toBe('events')
  })

  it('derives the i18n keys unless given, camel-casing full names of another resource', () => {
    const { permissions, scopes, roles } = eventsAccess.definitions
    expect(permissions.manage).toMatchObject({ name: 'events:manage', labelKey: 'events.permissions.manage', descriptionKey: 'events.permissions.manageDescription' })
    expect(permissions.pii).toMatchObject({ labelKey: 'custom.pii', descriptionKey: 'custom.piiDescription', sensitive: true })
    expect(permissions['tickets:read']).toMatchObject({ name: 'tickets:read', labelKey: 'events.permissions.ticketsRead', implicit: true })
    expect(scopes.tickets).toMatchObject({ name: 'tickets', labelKey: 'events.scopes.tickets', permissions: ['tickets:read'] })
    expect(roles.eventmanager).toMatchObject({ name: 'eventmanager', labelKey: 'events.roles.eventmanager', grant: ['events:manage'] })
  })

  it('takes another i18n namespace', () => {
    const access = defineAccess('oauth', { i18n: 'oauthServer', permissions: { 'read': {}, 'member-area:view': {} } })
    expect(access.definitions.permissions.read.labelKey).toBe('oauthServer.permissions.read')
    expect(access.definitions.permissions['member-area:view'].labelKey).toBe('oauthServer.permissions.memberAreaView')
  })

  it('rejects an invalid resource', () => {
    expect(() => defineAccess('Events', { permissions: {} })).toThrow(/not a valid resource/)
  })

  it('types the names as literals', () => {
    expectTypeOf(eventsAccess.permissions.manage).toEqualTypeOf<'events:manage'>()
    expectTypeOf(eventsAccess.permissions['tickets:read']).toEqualTypeOf<'tickets:read'>()
    expectTypeOf(eventsAccess.scopes.tickets).toEqualTypeOf<'tickets'>()
    expectTypeOf(eventsAccess.roles.eventmanager).toEqualTypeOf<'eventmanager'>()
    // @ts-expect-error not a key of the declaration
    expect(eventsAccess.permissions.mange).toBeUndefined()
  })

  it('compiles like the hand-written definitions', () => {
    const { nuxt, permissions, scopes, roles } = fakeNuxt()
    registerAccess(nuxt, eventsAccess)
    const result = compileAccess({ permissions: permissions(), namedScopes: scopes(), roles: [...roles(), { name: 'admin', grant: [], source: 'host' }] })
    expect(result.errors).toEqual([])
    expect(result.roles.roles.eventmanager!.permissions).toEqual(['events:manage'])
    expect(result.roles.roles.admin!.permissions).toEqual(['events:manage'])
  })
})

describe('registerAccess', () => {
  it('registers permissions, scopes and roles, with the resource as the roles\' provenance', () => {
    const { nuxt, permissions, scopes, roles } = fakeNuxt()
    registerAccess(nuxt, eventsAccess)
    expect(permissions().map(p => p.name)).toEqual(['events:manage', 'events:pii', 'tickets:read'])
    expect(permissions()[0]!.grantTo).toEqual(['admin', 'eventmanager'])
    expect(scopes().map(s => s.name)).toEqual(['tickets'])
    expect(roles()).toEqual([expect.objectContaining({ name: 'eventmanager', from: 'events' })])
  })

  it('leaves out roles (and `grantTo` into them), scopes and permissions on request', () => {
    const { nuxt, permissions, scopes, roles } = fakeNuxt()
    registerAccess(nuxt, eventsAccess, { roles: false, scopes: false, permissions: ['manage'], from: '@frigear-nu/events' })
    expect(permissions()).toEqual([expect.objectContaining({ name: 'events:manage', grantTo: ['admin'] })])
    expect(scopes()).toEqual([])
    expect(roles()).toEqual([])
  })

  it('takes a role list and its own provenance', () => {
    const { nuxt, roles } = fakeNuxt()
    registerAccess(nuxt, eventsAccess, { roles: ['eventmanager'], from: '@frigear-nu/events' })
    expect(roles()).toEqual([expect.objectContaining({ name: 'eventmanager', from: '@frigear-nu/events' })])
  })

  it('throws on a key the access does not define', () => {
    const { nuxt } = fakeNuxt()
    // @ts-expect-error not a permission key
    expect(() => registerAccess(nuxt, eventsAccess, { permissions: ['nope'] })).toThrow(/"nope" is not defined/)
  })
})

describe('defineRoles', () => {
  it('returns the roles unchanged', () => {
    const roles = { admin: { label: 'Admin', grant: ['*'] }, manager: { grant: ['events:*'], inherit: ['admin'] } }
    expect(defineRoles(roles)).toBe(roles)
  })
})

describe('generated types', () => {
  const access = fileURLToPath(new URL('../../src/runtime/access.ts', import.meta.url))

  /** Type-checks `source` against the generated `auth-access.d.ts` of `permissions`/`roles`; returns the error lines. */
  function typecheck(source: string, names = { permissions: ['events:manage', 'events:pii', 'tickets:read'], roles: ['admin', 'eventmanager'] }) {
    const dir = mkdtempSync(join(tmpdir(), 'auth-access-types-'))
    try {
      writeFileSync(join(dir, 'auth-access.d.ts'), accessTypes(names))
      writeFileSync(join(dir, 'usage.ts'), `import { defineRoles } from ${JSON.stringify(access.replace(/\.ts$/, ''))}\nimport type { Permission } from ${JSON.stringify(access.replace(/\.ts$/, ''))}\n${source}\n`)
      const program = ts.createProgram([join(dir, 'auth-access.d.ts'), join(dir, 'usage.ts')], {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        types: [],
      })
      return ts.getPreEmitDiagnostics(program)
        .filter(diagnostic => diagnostic.file?.fileName.endsWith('usage.ts'))
        .map(diagnostic => diagnostic.file!.getLineAndCharacterOfPosition(diagnostic.start!).line - 2)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('lists the registered names as keys of global interfaces', () => {
    expect(accessTypes({ permissions: ['events:manage'], roles: ['admin'] })).toContain('interface FrigearPermissions {\n    "events:manage": true\n  }')
  })

  it('makes a misspelled permission, grant or parent role fail typecheck', { timeout: 30_000 }, () => {
    const lines = [
      'const ok: Permission = \'events:manage\'',
      'const typo: Permission = \'events:mange\'',
      'defineRoles({ a: { grant: [\'events:*\', \'*\', \'tickets:read\'], inherit: [\'eventmanager\', \'b\'] }, b: {} })',
      'defineRoles({ a: { grant: [\'event:*\'] } })',
      'defineRoles({ a: { inherit: [\'nobody\'] } })',
      'export { ok, typo }',
    ]
    expect(typecheck(lines.join('\n'))).toEqual([1, 3, 4])
  })

  it('falls back to `string` when nothing is registered', { timeout: 30_000 }, () => {
    expect(typecheck('export const any: Permission = \'whatever:else\'', { permissions: [], roles: [] })).toEqual([])
  })
})
