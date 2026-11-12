import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@nuxthub/db', () => ({ db: {}, schema: {} }))

// The auth server utils `usersAdminTargetMissing` relies on (auto-imported in a Nuxt app).
const users: Record<number, { id: number, email: string }> = {
  1: { id: 1, email: 'admin@example.com' },
  2: { id: 2, email: 'coordinator@example.com' },
  3: { id: 3, email: 'member@example.com' },
  4: { id: 4, email: 'pii@example.com' },
}
const permissions: Record<number, string[]> = {
  // `*` covers every non-sensitive permission; `forms:pii` is sensitive, so only a user granted it by name holds it.
  1: ['events:read', 'forms:manage', 'profile:read', 'users:delete', 'users:read', 'users:update'],
  2: ['profile:read', 'users:delete', 'users:read', 'users:update'],
  3: ['profile:read'],
  4: ['forms:pii', 'profile:read'],
}
/** Permissions an `authorization:before` listener allows, by user. */
const before = new Map<number, string[]>()

const subjectAllowed = vi.fn(async (_event: unknown, user: { id: number }, permission: string) =>
  permissions[user.id]!.includes(permission) || (before.get(user.id) ?? []).includes(permission))
vi.stubGlobal('loadAuthUser', async (id: number) => users[id] ?? null)
vi.stubGlobal('getUserPermissions', async (_event: unknown, user: { id: number }) => permissions[user.id] ?? [])
vi.stubGlobal('subjectAllowed', subjectAllowed)
/** Users whose roles cannot be resolved (`getEffectiveRoles(..., { strict: true })` throws). */
const brokenRoles = new Set<number>()
vi.stubGlobal('getEffectiveRoles', async (_event: unknown, user: { id: number }, options?: { strict?: boolean }) => {
  if (brokenRoles.has(user.id) && options?.strict) throw new Error('roles unavailable')
  return []
})

const { usersAdminTargetMissing } = await import('../../src/runtime/server/utils/admin')

const event = {} as never

describe('usersAdminTargetMissing (target protection)', () => {
  beforeEach(() => {
    subjectAllowed.mockClear()
    before.clear()
    brokenRoles.clear()
  })

  it('refuses a coordinator a user holding more than they do (an admin)', async () => {
    expect(await usersAdminTargetMissing(event, users[2]!, 1)).toEqual(['events:read', 'forms:manage'])
  })

  it('lets staff change users holding nothing more than they do', async () => {
    expect(await usersAdminTargetMissing(event, users[2]!, 3)).toEqual([])
    expect(await usersAdminTargetMissing(event, users[1]!, 2)).toEqual([])
  })

  it('counts sensitive permissions by name: an admin lacking `forms:pii` cannot change its holder', async () => {
    expect(await usersAdminTargetMissing(event, users[1]!, 4)).toEqual(['forms:pii'])
  })

  it('counts what the `authorization:before` hook allows the actor', async () => {
    before.set(2, ['events:read', 'forms:manage'])
    expect(await usersAdminTargetMissing(event, users[2]!, 1)).toEqual([])
  })

  it('fails closed (403) when the target\'s roles cannot be resolved', async () => {
    brokenRoles.add(3)
    vi.spyOn(console, 'error').mockImplementationOnce(() => {})
    await expect(usersAdminTargetMissing(event, users[1]!, 3)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('is empty for yourself and for an unknown user, without checking anything', async () => {
    expect(await usersAdminTargetMissing(event, users[3]!, 3)).toEqual([])
    expect(await usersAdminTargetMissing(event, users[3]!, 999)).toEqual([])
    expect(subjectAllowed).not.toHaveBeenCalled()
  })
})
