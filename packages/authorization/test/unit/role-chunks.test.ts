import { beforeEach, describe, expect, it, vi } from 'vitest'

// D1 binds at most 100 parameters per statement. The e2e suite runs on local sqlite, which binds thousands, so it would
// pass unchunked: here every statement's `inArray` list is recorded instead, against a database that answers each
// chunk with its own values.
const statements: unknown[][] = []
let answer: (values: unknown[]) => unknown[] = () => []

vi.mock('drizzle-orm', async (importOriginal) => {
  const original = await importOriginal<typeof import('drizzle-orm')>()
  return {
    ...original,
    inArray: (_column: unknown, values: unknown[]) => {
      statements.push([...values])
      return { values }
    },
    asc: () => undefined,
  }
})

function query() {
  let where: { values: unknown[] } | undefined
  let limit = Number.POSITIVE_INFINITY
  const builder = {
    from: () => builder,
    where: (condition: { values: unknown[] }) => {
      where = condition
      return builder
    },
    orderBy: () => builder,
    limit: (value: number) => {
      limit = value
      return builder
    },
    then: (resolve: (rows: unknown[]) => unknown) => resolve(answer(where?.values ?? []).slice(0, limit)),
  }
  return builder
}

vi.mock('@nuxthub/db', () => ({
  db: { select: () => query(), selectDistinct: () => query() },
  schema: { authorizationUserRoles: {}, authorizationMeta: {} },
}))
vi.mock('#auth/permissions', () => ({ registry: { permissions: {}, aliases: {} } }))
vi.mock('#auth/roles', () => ({ table: { roles: {}, defaultRoles: [], autoRoles: [] } }))

const { listAuthorizationRoleHolders, listAuthorizationRolesOf } = await import('../../src/runtime/server/utils/authorization-roles')

describe('role queries stay under D1\'s bound-parameter limit', () => {
  beforeEach(() => {
    statements.length = 0
  })

  it('reads the stored roles of 1000 users at most 90 ids per statement', async () => {
    answer = values => values.map(userId => ({ userId, role: 'editor' }))
    const ids = Array.from({ length: 1000 }, (_, index) => index + 1)
    const roles = await listAuthorizationRolesOf([...ids, 1, 2])
    expect(statements.length).toBe(Math.ceil(1000 / 90))
    expect(Math.max(...statements.map(values => values.length))).toBeLessThanOrEqual(90)
    // Duplicates are bound once, and every user is answered.
    expect(statements.flat()).toHaveLength(1000)
    expect(roles.size).toBe(1000)
  })

  it('lists the holders of 200 roles at most 90 roles per statement (plus the limit), lowest ids first', async () => {
    // Each role is held by the user whose id is its number, so the chunks answer different users (ordered by id).
    answer = values => values.map(role => ({ userId: Number(String(role).slice(1)) })).sort((a, b) => a.userId - b.userId)
    const roles = Array.from({ length: 200 }, (_, index) => `r${200 - index}`)
    const holders = await listAuthorizationRoleHolders(roles, 5)
    expect(statements.length).toBe(Math.ceil(200 / 90))
    expect(Math.max(...statements.map(values => values.length))).toBeLessThanOrEqual(90)
    // The lowest ids win across chunks, though they were in the last chunk.
    expect(holders).toEqual([1, 2, 3, 4, 5])
  })
})
