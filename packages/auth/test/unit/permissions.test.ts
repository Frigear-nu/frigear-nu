import { describe, expect, it } from 'vitest'
import {
  combineBefore,
  compileRoles,
  createBeforeCollector,
  createPermissionRegistry,
  decide,
  defineSharedPolicy,
  expandScopes,
  holds,
  implicitPermissions,
  isKnownPermission,
  isKnownScope,
  matches,
  resolveEffectiveRoles,
  rolePermissions,
  roleScopeCap,
  runSharedPolicies,
  scopeGrantable,
  validateNamedScopes,
  validatePermissionName,
  validateRoleScopes,
} from '../../src/runtime/utils/permissions'
import type {
  BeforeVote,
  DecideInput,
  DecisionPrincipal,
  NamedScopes,
  PermissionDefinition,
  PolicyOutcome,
  RoleDefinition,
  ScopeGrantContext,
} from '../../src/runtime/utils/permissions'

const definitions: PermissionDefinition[] = [
  { name: 'events:read' },
  { name: 'events:update', aliases: ['events:manage'] },
  { name: 'events:create', aliases: ['events:manage'] },
  { name: 'events:pii' },
  { name: 'forms:read' },
  { name: 'forms:update' },
  { name: 'users:read' },
  { name: 'users:list' },
  { name: 'users:manage', sessionOnly: true },
  { name: 'tickets:read', implicit: true },
  { name: 'tickets:write', implicit: true },
  { name: 'member-area:view' },
  { name: 'payments:audit', sensitive: true },
]

function registry(defs: PermissionDefinition[] = definitions) {
  const { value, errors } = createPermissionRegistry(defs)
  expect(errors).toEqual([])
  return value
}

const reg = registry()

describe('validatePermissionName', () => {
  it('accepts resource:action names', () => {
    expect(validatePermissionName('events:read')).toBeNull()
    expect(validatePermissionName('member-area:view')).toBeNull()
  })

  it.each(['events', 'events:*', '*', 'Events:Read', 'a:b:c', ':read', 'events:', 'events read'])('rejects %s', (name) => {
    expect(validatePermissionName(name)).toBeTypeOf('string')
  })
})

describe('createPermissionRegistry', () => {
  it('marks :pii sensitive by default and applies defaults', () => {
    expect(reg.permissions['events:pii']!.sensitive).toBe(true)
    expect(reg.permissions['events:read']).toMatchObject({ sensitive: false, sessionOnly: false, implicit: false, group: 'events', resource: 'events' })
  })

  it('maps an alias to every permission it was split into', () => {
    expect(reg.aliases['events:manage']).toEqual(['events:create', 'events:update'])
  })

  it('merges identical redefinitions and rejects conflicting ones', () => {
    expect(createPermissionRegistry([{ name: 'a:b' }, { name: 'a:b', label: 'B' }]).value.permissions['a:b']!.label).toBe('B')
    expect(createPermissionRegistry([{ name: 'a:b' }, { name: 'a:b', sessionOnly: true }]).errors[0]).toMatch(/sessionOnly/)
    expect(createPermissionRegistry([{ name: 'a:b', group: 'G' }, { name: 'a:b', label: 'B' }]).value.permissions['a:b']!.group).toBe('G')
  })

  it('rejects invalid names and aliases that shadow a permission', () => {
    expect(createPermissionRegistry([{ name: 'nope' }]).errors).toHaveLength(1)
    expect(createPermissionRegistry([{ name: 'a:b' }, { name: 'a:c', aliases: ['a:b'] }]).errors[0]).toMatch(/itself a registered/)
  })

  it('lists implicit permissions', () => {
    expect(implicitPermissions(reg)).toEqual(['tickets:read', 'tickets:write'])
    expect(isKnownPermission('events:read', reg)).toBe(true)
    expect(isKnownPermission('events:manage', reg)).toBe(false)
  })
})

describe('matches', () => {
  it('matches by name and by wildcard', () => {
    expect(matches('events:read', 'events:read')).toBe(true)
    expect(matches('*', 'events:read')).toBe(true)
    expect(matches('events:*', 'events:read')).toBe(true)
    expect(matches('events:*', 'forms:read')).toBe(false)
    expect(matches('event:*', 'events:read')).toBe(false)
    expect(matches('events', 'events:read')).toBe(false)
  })

  it('never covers a sensitive permission with a wildcard', () => {
    expect(matches('*', 'events:pii')).toBe(false)
    expect(matches('events:*', 'events:pii')).toBe(false)
    expect(matches('events:pii', 'events:pii')).toBe(true)
    expect(matches('*', 'payments:audit', { sensitive: true })).toBe(false)
    expect(matches('*', 'events:pii', { sensitive: false })).toBe(true)
  })
})

describe('holds', () => {
  it('is false for unknown permissions, even with *', () => {
    expect(holds(['*'], 'ghost:read', reg)).toBe(false)
    expect(holds(['ghost:read'], 'ghost:read', reg)).toBe(false)
  })

  it('respects the sensitive flag from the registry', () => {
    expect(holds(['*'], 'payments:audit', reg)).toBe(false)
    expect(holds(['payments:*'], 'payments:audit', reg)).toBe(false)
    expect(holds(['payments:audit'], 'payments:audit', reg)).toBe(true)
  })

  it('expands aliases on the held side only', () => {
    expect(holds(['events:manage'], 'events:update', reg)).toBe(true)
    expect(holds(['events:manage'], 'events:create', reg)).toBe(true)
    expect(holds(['events:manage'], 'events:read', reg)).toBe(false)
    // Checking for the old name fails: it is no longer a permission.
    expect(holds(['events:update', 'events:create'], 'events:manage', reg)).toBe(false)
    expect(holds(['*'], 'events:manage', reg)).toBe(false)
  })
})

const named: NamedScopes = {
  tickets: { name: 'tickets', permissions: ['tickets:read', 'tickets:write'] },
  openid: { name: 'openid' },
  profile: { name: 'profile' },
  staff: { name: 'staff', permissions: ['events:*'] },
}

describe('expandScopes', () => {
  it('expands named scopes, aliases and wildcards to concrete permissions', () => {
    expect(expandScopes(['tickets'], reg, named)).toEqual(['tickets:read', 'tickets:write'])
    expect(expandScopes(['openid'], reg, named)).toEqual([])
    expect(expandScopes(['events:manage'], reg, named)).toEqual(['events:create', 'events:update'])
    expect(expandScopes(['events:*'], reg)).toEqual(['events:create', 'events:read', 'events:update'])
    expect(expandScopes(['staff', 'tickets:read'], reg, named)).toEqual(['events:create', 'events:read', 'events:update', 'tickets:read'])
  })

  it('never yields sensitive permissions from a wildcard, nor session-only or unknown ones', () => {
    expect(expandScopes(['*'], reg)).not.toContain('events:pii')
    expect(expandScopes(['*'], reg)).not.toContain('users:manage')
    expect(expandScopes(['users:manage', 'ghost:read', 'nonsense'], reg)).toEqual([])
    expect(expandScopes(['events:pii'], reg)).toEqual(['events:pii'])
  })

  it('knows which scopes exist', () => {
    expect(isKnownScope('tickets', reg, named)).toBe(true)
    expect(isKnownScope('events:manage', reg)).toBe(true)
    expect(isKnownScope('events:*', reg)).toBe(true)
    expect(isKnownScope('ghost:*', reg)).toBe(false)
    expect(isKnownScope('users:manage', reg)).toBe(false)
    expect(isKnownScope('nope', reg, named)).toBe(false)
  })

  it('rejects a named scope whose alias expands to a sensitive permission', () => {
    const withAlias = registry([...definitions, { name: 'users:pii', aliases: ['users:old'] }])
    expect(validateNamedScopes({ bad: { name: 'bad', permissions: ['users:old'] } }, withAlias)[0]).toMatch(/sensitive/)
  })

  it('validates named scopes', () => {
    expect(validateNamedScopes(named, reg)).toEqual([])
    const errors = validateNamedScopes({
      'bad': { name: 'bad', permissions: ['events:pii', 'users:manage', 'ghost:*', 'bogus'] },
      'a:b': { name: 'a:b' },
    }, reg)
    expect(errors).toHaveLength(5)
  })
})

const roles: Record<string, RoleDefinition> = {
  admin: { grant: ['*'] },
  manager: { grant: ['forms:*', 'users:read', 'users:list'], inherit: ['eventmanager'] },
  eventmanager: { grant: ['events:*'], inherit: ['user'] },
  member: { grant: ['member-area:view'], requirements: { subscription: '*' }, auto: true, inherit: ['user'] },
  user: { grant: ['events:read'] },
}

function table(overrides: Partial<Parameters<typeof compileRoles>[0]> = {}) {
  return compileRoles({ roles, defaultRoles: ['user'], registry: reg, requirementNames: ['subscription'], ...overrides })
}

describe('compileRoles', () => {
  it('resolves the inheritance closure and the permissions it holds', () => {
    const { value, errors } = table()
    expect(errors).toEqual([])
    expect(value.roles.manager!.inherited).toEqual(['eventmanager', 'user'])
    expect(value.roles.manager!.permissions).toEqual([
      'events:create', 'events:read', 'events:update', 'forms:read', 'forms:update', 'users:list', 'users:read',
    ])
    expect(value.roles.admin!.permissions).not.toContain('events:pii')
    expect(value.roles.admin!.permissions).toContain('users:manage')
  })

  it('marks auto and default roles as not assignable', () => {
    const { value } = table()
    expect(value.autoRoles).toEqual(['member'])
    expect(value.defaultRoles).toEqual(['user'])
    expect(value.roles.member!.assignable).toBe(false)
    expect(value.roles.user!.assignable).toBe(false)
    expect(value.roles.manager!.assignable).toBe(true)
  })

  it('fails on unregistered grants and wildcards matching nothing', () => {
    const { errors } = table({ roles: { a: { grant: ['ghost:read', 'ghost:*', 'events:manage', 'bad grant'] } }, defaultRoles: [] })
    expect(errors).toHaveLength(3)
    expect(errors.join('\n')).toMatch(/ghost:read/)
    expect(errors.join('\n')).toMatch(/ghost:\*/)
  })

  it('fails on an unknown requirement or inherit, a cycle, and an auto default role', () => {
    expect(table({ requirementNames: [] }).errors[0]).toMatch(/unknown requirement "subscription"/)
    expect(table({ roles: { a: { inherit: ['nope'] } }, defaultRoles: [] }).errors[0]).toMatch(/inherits "nope"/)
    const cycle = table({ roles: { a: { inherit: ['b'] }, b: { inherit: ['c'] }, c: { inherit: ['a'] } }, defaultRoles: [] }).errors
    expect(cycle).toHaveLength(1)
    expect(cycle[0]).toMatch(/cycle/)
    expect(table({ defaultRoles: ['member'] }).errors[0]).toMatch(/`auto`/)
    expect(table({ defaultRoles: ['ghost'] }).errors[0]).toMatch(/not defined/)
  })

  it('validates roleScopes role names', () => {
    expect(validateRoleScopes({ admin: ['*'], ghost: [] }, table().value)).toHaveLength(1)
  })
})

describe('resolveEffectiveRoles', () => {
  const { value: compiled } = table()

  it('unions assigned, default, auto and hook roles, closed over inherit', () => {
    const result = resolveEffectiveRoles({ table: compiled, assigned: ['manager', 'legacy'], requirementsMet: () => true })
    expect(result.roles).toEqual(['eventmanager', 'manager', 'member', 'user'])
    expect(result.unknown).toEqual(['legacy'])
    expect(resolveEffectiveRoles({ table: compiled, assigned: [], extra: ['admin'], requirementsMet: () => false }).roles).toEqual(['admin', 'user'])
  })

  it('drops roles whose requirements fail or throw, also when inherited', () => {
    expect(resolveEffectiveRoles({ table: compiled, assigned: [], requirementsMet: () => false }).roles).toEqual(['user'])
    expect(resolveEffectiveRoles({ table: compiled, assigned: [], requirementsMet: () => {
      throw new Error('db down')
    } }).roles).toEqual(['user'])
    const gated = compileRoles({
      roles: { paid: { grant: ['forms:read'], requirements: { subscription: 'pro' } }, boss: { inherit: ['paid'] } },
      registry: reg,
      requirementNames: ['subscription'],
    }).value
    expect(resolveEffectiveRoles({ table: gated, assigned: ['boss'], requirementsMet: () => false }).roles).toEqual(['boss'])
  })

  it('builds the held list with implicit permissions', () => {
    expect(rolePermissions(['user'], compiled, reg)).toEqual(['events:read', 'tickets:read', 'tickets:write'])
  })
})

describe('decide', () => {
  const session: DecisionPrincipal = { kind: 'session' }
  const userToken = (permissions: string[]): DecisionPrincipal => ({ kind: 'user-token', permissions })
  const oauth = (permissions: string[]): DecisionPrincipal => ({ kind: 'oauth', permissions })
  const run = (input: Partial<DecideInput> & { permission: string }) => decide({ registry: reg, principal: session, granted: ['events:*'], ...input })

  it('1: an unknown permission is forbidden, even for admins and before allow', () => {
    expect(run({ permission: 'ghost:read', granted: ['*'], before: ['allow'] })).toEqual({ allowed: false, status: 403, code: 'forbidden', via: 'registry' })
    expect(run({ permission: 'events:manage', granted: ['events:manage'] })).toMatchObject({ allowed: false, via: 'registry' })
  })

  it('1: Object.prototype names are unknown, never matched by * nor thrown on', () => {
    expect(run({ permission: 'constructor', granted: ['*'] })).toMatchObject({ allowed: false, via: 'registry' })
    expect(run({ permission: 'events:read', granted: ['toString', 'events:read'] })).toMatchObject({ allowed: true })
    expect(isKnownScope('constructor', reg)).toBe(false)
  })

  it('2: no principal is unauthorized', () => {
    expect(run({ permission: 'events:read', principal: null, before: ['allow'] })).toEqual({ allowed: false, status: 401, code: 'unauthorized', via: 'credential' })
  })

  describe.each([
    ['user-token', userToken],
    ['oauth', oauth],
  ] as const)('3-4: a %s bearer', (_kind, bearer) => {
    it('is refused session-only permissions, whatever before or roles say', () => {
      expect(run({ permission: 'users:manage', principal: bearer(['users:manage']), granted: ['*'], before: ['allow'] }))
        .toEqual({ allowed: false, status: 403, code: 'session_required', via: 'credential' })
    })

    it('is limited to its frozen permissions; before cannot widen them', () => {
      expect(run({ permission: 'events:update', principal: bearer(['events:read']), before: ['allow'] }))
        .toEqual({ allowed: false, status: 403, code: 'insufficient_scope', via: 'credential' })
      expect(run({ permission: 'events:update', principal: { kind: _kind } }))
        .toMatchObject({ code: 'insufficient_scope' })
    })

    it('still needs the user to hold the permission now', () => {
      expect(run({ permission: 'events:update', principal: bearer(['events:update']), granted: ['events:read'] }))
        .toMatchObject({ allowed: false, code: 'forbidden', via: 'role' })
      expect(run({ permission: 'events:update', principal: bearer(['events:update']) })).toMatchObject({ allowed: true, via: 'role' })
    })

    it('can be allowed or denied by before within its permissions', () => {
      expect(run({ permission: 'events:update', principal: bearer(['events:update']), granted: [], before: ['allow'] })).toMatchObject({ allowed: true, via: 'before' })
      expect(run({ permission: 'events:update', principal: bearer(['events:update']), before: ['deny'] })).toMatchObject({ allowed: false, via: 'before' })
    })
  })

  it('3: a session may use session-only permissions its roles grant', () => {
    expect(run({ permission: 'users:manage', granted: ['users:manage'] })).toMatchObject({ allowed: true })
    expect(run({ permission: 'users:manage', granted: ['events:*'] })).toMatchObject({ allowed: false, via: 'role' })
  })

  it.each<[BeforeVote[], 'allow' | 'deny' | undefined]>([
    [[], undefined],
    [[undefined, undefined], undefined],
    [['allow'], 'allow'],
    [['deny'], 'deny'],
    [['throw'], 'deny'],
    [['allow', 'deny'], 'deny'],
    [['allow', 'throw'], 'deny'],
    [[undefined, 'allow'], 'allow'],
  ])('5: before votes %j combine to %s', (votes, expected) => {
    expect(combineBefore(votes)).toBe(expected)
    const decision = run({ permission: 'forms:read', granted: [], before: votes, hasRecord: true, policies: [{ result: false }] })
    if (expected === 'allow') expect(decision).toEqual({ allowed: true, status: 200, via: 'before' })
    else if (expected === 'deny') expect(decision).toEqual({ allowed: false, status: 403, code: 'forbidden', via: 'before' })
    else expect(decision).toMatchObject({ allowed: false, via: 'role' })
  })

  it('5: before deny beats a role grant', () => {
    expect(run({ permission: 'events:read', granted: ['*'], before: ['deny'] })).toMatchObject({ allowed: false, via: 'before' })
  })

  it('6: roles grant, including wildcards, but sensitive ones only by name', () => {
    expect(run({ permission: 'events:update', granted: ['events:*'] })).toEqual({ allowed: true, status: 200, via: 'role' })
    expect(run({ permission: 'forms:read', granted: ['events:*'] })).toMatchObject({ allowed: false, code: 'forbidden', via: 'role' })
    expect(run({ permission: 'events:pii', granted: ['*'] })).toMatchObject({ allowed: false })
    expect(run({ permission: 'events:pii', granted: ['events:pii'] })).toMatchObject({ allowed: true })
    expect(run({ permission: 'events:read', granted: undefined })).toMatchObject({ allowed: false })
  })

  it('6: a foreign token uses its own permissions instead of roles', () => {
    const foreign: DecisionPrincipal = { kind: 'oauth', permissions: ['events:read'], foreign: true }
    expect(run({ permission: 'events:read', principal: foreign, granted: [] })).toMatchObject({ allowed: true, via: 'role' })
    expect(run({ permission: 'events:update', principal: foreign, granted: ['*'] })).toMatchObject({ allowed: false, code: 'insufficient_scope' })
  })

  describe('7: policies', () => {
    const outcome = (result: PolicyOutcome['result'], withoutRecord = false): PolicyOutcome => ({ result, withoutRecord })

    it.each<[PolicyOutcome['result'][], boolean, 'role' | 'policy']>([
      [[true], true, 'policy'],
      [[undefined], true, 'role'],
      [[false], false, 'policy'],
      [['throw'], false, 'policy'],
      [[true, false], false, 'policy'],
      [[true, undefined], true, 'policy'],
      [[], true, 'role'],
    ])('with a record, %j -> allowed %s', (results, allowed, via) => {
      expect(run({ permission: 'events:update', hasRecord: true, policies: results.map(r => outcome(r)) })).toMatchObject({ allowed, via })
    })

    it('never grant what roles do not', () => {
      expect(run({ permission: 'events:update', granted: [], hasRecord: true, policies: [outcome(true)] })).toMatchObject({ allowed: false, via: 'role' })
    })

    it('without a record only run when withoutRecord is set', () => {
      expect(run({ permission: 'events:update', policies: [outcome(false)] })).toEqual({ allowed: true, status: 200, via: 'role' })
      expect(run({ permission: 'events:update', policies: [outcome(false, true)] })).toMatchObject({ allowed: false, via: 'policy' })
      expect(run({ permission: 'events:update', policies: [outcome('throw', true)] })).toMatchObject({ allowed: false, via: 'policy' })
    })

    it('are skipped when before allows', () => {
      expect(run({ permission: 'events:update', before: ['allow'], hasRecord: true, policies: [outcome(false)] })).toMatchObject({ allowed: true, via: 'before' })
    })
  })

  it('collects allow and deny from listeners', () => {
    const collector = createBeforeCollector()
    expect(collector.outcome()).toBeUndefined()
    collector.allow()
    expect(collector.outcome()).toBe('allow')
    collector.fail()
    expect(collector.outcome()).toBe('deny')
  })
})

describe('scopeGrantable', () => {
  const { value: compiled } = table()
  const ctx = (overrides: Partial<ScopeGrantContext> = {}): ScopeGrantContext => {
    const roleNames = overrides.roles ?? ['user']
    const held = rolePermissions(roleNames, compiled, reg)
    return { registry: reg, namedScopes: named, roles: roleNames, canGrant: p => holds(held, p, reg), ...overrides }
  }

  it('needs every expanded permission to pass', () => {
    expect(scopeGrantable('events:read', ctx())).toBe(true)
    expect(scopeGrantable('events:update', ctx())).toBe(false)
    expect(scopeGrantable('tickets', ctx())).toBe(true)
    expect(scopeGrantable('openid', ctx())).toBe(true)
    expect(scopeGrantable('events:manage', ctx({ roles: ['eventmanager', 'user'] }))).toBe(true)
  })

  it('refuses unknown and session-only scopes', () => {
    expect(scopeGrantable('ghost:read', ctx({ canGrant: () => true }))).toBe(false)
    expect(scopeGrantable('users:manage', ctx({ canGrant: () => true }))).toBe(false)
  })

  it('allows wildcard scopes only for clients that accept them', () => {
    const admin = ctx({ roles: ['admin', 'user'], canGrant: () => true })
    expect(scopeGrantable('events:*', admin)).toBe(false)
    expect(scopeGrantable('events:*', { ...admin, wildcardScopes: true })).toBe(true)
    expect(scopeGrantable('*', { ...admin, wildcardScopes: true })).toBe(true)
    expect(scopeGrantable('ghost:*', { ...admin, wildcardScopes: true })).toBe(false)
  })

  it('caps by the union of roleScopes over the user\'s roles; unset means no cap', () => {
    const roleScopes = { admin: ['*'], user: ['openid', 'profile', 'tickets:read', 'tickets:write'], eventmanager: ['events:read'] }
    expect(roleScopeCap(['user', 'eventmanager'], roleScopes)).toEqual(['events:read', 'openid', 'profile', 'tickets:read', 'tickets:write'])
    expect(roleScopeCap(['user'], undefined)).toBeUndefined()

    const user = ctx({ roleScopes })
    expect(scopeGrantable('openid', user)).toBe(true)
    expect(scopeGrantable('tickets', user)).toBe(true) // every permission of the named scope is within the cap
    expect(scopeGrantable('events:read', user)).toBe(false) // held, but not within user's cap
    expect(scopeGrantable('events:read', ctx({ roles: ['eventmanager', 'user'], roleScopes }))).toBe(true)
    expect(scopeGrantable('staff', ctx({ roles: ['eventmanager', 'user'], roleScopes }))).toBe(false)
    expect(scopeGrantable('events:update', ctx({ roles: ['admin', 'user'], roleScopes, canGrant: () => true }))).toBe(true)
    // A role missing from roleScopes contributes nothing.
    expect(scopeGrantable('openid', ctx({ roles: ['manager'], roleScopes }))).toBe(false)
  })
})

describe('defineSharedPolicy', () => {
  it('rejects invalid permission names', () => {
    expect(() => defineSharedPolicy('events', () => true)).toThrow(/resource:action/)
  })

  it('runs synchronously into outcomes, failing closed on throws and promises', () => {
    const own = defineSharedPolicy<{ ownerId: number }, { id: number }>('events:update', ({ user, record }) => record?.ownerId === user?.id || undefined)
    const broken = defineSharedPolicy('events:update', () => {
      throw new Error('boom')
    })
    const sneaky = defineSharedPolicy('events:update', (() => Promise.resolve(true)) as unknown as () => boolean, { withoutRecord: true })
    const base = { user: { id: 1 }, access: null, granted: true }
    expect(runSharedPolicies([own], { ...base, record: { ownerId: 1 } })).toEqual([{ result: true, withoutRecord: false }])
    expect(runSharedPolicies([own], { ...base, record: { ownerId: 2 } })).toEqual([{ result: undefined, withoutRecord: false }])
    expect(runSharedPolicies([broken], { ...base, record: { ownerId: 1 } })[0]!.result).toBe('throw')
    expect(runSharedPolicies([sneaky], { ...base, record: undefined })[0]!.result).toBe('throw')
  })
})
