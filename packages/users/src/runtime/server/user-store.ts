import { db, schema } from '@nuxthub/db'
import { eq, getTableName, sql } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import type { AuthUserStore } from '@frigear-nu/auth/utils'

// The user store `@frigear-nu/auth` reads and writes users through: sign-in flows and bearer credentials. It reads
// the database on every call, so role changes apply immediately instead of at the user's next login like the session
// snapshot.
const asId = (id: string | number) => {
  const numeric = Number(id)
  return Number.isSafeInteger(numeric) ? numeric : null
}

// Every column in the generated schema (all modules) that references `users.id`.
function userReferences() {
  const usersTable = getTableName(schema.users)
  const references: { table: string, column: string }[] = []
  for (const table of Object.values(schema)) {
    let tableConfig: ReturnType<typeof getTableConfig>
    try {
      tableConfig = getTableConfig(table as never)
    }
    catch {
      continue
    }
    for (const foreignKey of tableConfig.foreignKeys) {
      const { columns, foreignTable, foreignColumns } = foreignKey.reference()
      if (getTableName(foreignTable) === usersTable && foreignColumns[0]?.name === 'id') {
        references.push({ table: tableConfig.name, column: columns[0]!.name })
      }
    }
  }
  return references
}

function rekeyStatements(from: number, to: number) {
  return [
    ...userReferences().map(ref => db.run(sql`UPDATE ${sql.identifier(ref.table)} SET ${sql.identifier(ref.column)} = ${to} WHERE ${sql.identifier(ref.column)} = ${from}`)),
    ...rekeyUserAuthData(from, to),
    db.run(sql`UPDATE ${sql.identifier(getTableName(schema.users))} SET id = ${to} WHERE id = ${from}`),
  ]
}

const store: AuthUserStore = {
  async findById(id) {
    const numeric = asId(id)
    if (numeric === null) return null
    return await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, numeric) }) ?? null
  },
  async findByEmail(email) {
    return await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, email) }) ?? null
  },
  async create(values) {
    const [user] = await db.insert(schema.users).values(values).returning()
    return user!
  },
  async update(id, values) {
    const [user] = await db.update(schema.users).set(values).where(eq(schema.users.id, id)).returning()
    return user ?? null
  },
  async remove(id) {
    await db.delete(schema.users).where(eq(schema.users.id, id))
  },
  /** One batch with deferred foreign keys, so rows in other tables that reference the user follow the new id. */
  async changeId(from, to) {
    const holder = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, to) })
    let moveAsideTo: number | undefined
    if (holder) {
      const [row] = await db.select({ maxId: sql<number>`coalesce(max(${schema.users.id}), 0)` }).from(schema.users)
      moveAsideTo = Math.max(row?.maxId ?? 0, to) + 1
    }
    const statements = [
      db.run(sql`PRAGMA defer_foreign_keys = ON`),
      ...(moveAsideTo === undefined ? [] : rekeyStatements(to, moveAsideTo)),
      ...rekeyStatements(from, to),
    ]
    await (db as unknown as { batch: (queries: unknown[]) => Promise<unknown> }).batch(statements)
  },
}

export default store