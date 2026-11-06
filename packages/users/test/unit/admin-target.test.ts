import { describe, expect, it, vi } from 'vitest'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// The users table as `@frigear-nu/auth` and `@frigear-nu/authorization` extend it.
const users = sqliteTable('users', {
  id: integer().primaryKey(),
  email: text().notNull(),
  role: text(),
  emailVerifiedAt: integer({ mode: 'timestamp' }),
})
vi.mock('@nuxthub/db', () => ({ db: {}, schema: { users } }))
vi.stubGlobal('definePolicyGate', () => ({}))

const { usersAdminTargetInfo } = await import('../../src/runtime/server/utils/admin')

describe('usersAdminTargetInfo', () => {
  // A host that grants roles by email allowlist requires a verified address; without it in the target, an
  // allowlisted admin would look like a plain user to the policy, and lower staff could edit them.
  it('hands the policy the target\'s email verification', () => {
    const verifiedAt = new Date()
    expect(usersAdminTargetInfo({ id: 1, email: 'a@example.com', role: 'user', emailVerifiedAt: verifiedAt } as never))
      .toEqual({ id: 1, email: 'a@example.com', role: 'user', emailVerifiedAt: verifiedAt })
    expect(usersAdminTargetInfo({ id: 2, email: 'b@example.com', emailVerifiedAt: null }).emailVerifiedAt).toBeNull()
  })
})
