import { db, schema } from '@nuxthub/db'
import { eq, getTableColumns, getTableName, is, sql, Table, type Column } from 'drizzle-orm'
import { getTableConfig as getSQLiteTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core'
import { getTableConfig as getPgTableConfig, PgTable } from 'drizzle-orm/pg-core'
import type { AuthUserStore } from '@frigear-nu/auth/utils'

// The user store `@frigear-nu/auth` reads and writes users through: sign-in flows and bearer credentials. It reads
// the database on every call, so role changes apply immediately instead of at the user's next login like the session
// snapshot.
const asId = (id: string | number) => {
  const numeric = Number(id)
  return Number.isSafeInteger(numeric) ? numeric : null
}

// The host picks the dialect (`hub.db`); the generated schema tells which one it is.
const isPostgres = () => is(schema.users, PgTable)

const getTableConfig = (table: Table) => is(table, PgTable) ? getPgTableConfig(table) : getSQLiteTableConfig(table as SQLiteTable)

// Every column in the generated schema (all modules) that references `users.id`.
function userReferences() {
  const usersTable = getTableName(schema.users)
  const references: { table: string, column: string, source: Table, key: string, target: Column }[] = []
  for (const table of Object.values(schema)) {
    if (!is(table, Table)) continue
    const tableConfig = getTableConfig(table)
    for (const foreignKey of tableConfig.foreignKeys) {
      const { columns, foreignTable, foreignColumns } = foreignKey.reference()
      if (getTableName(foreignTable) === usersTable && foreignColumns[0]?.name === 'id') {
        const target = columns[0]!
        const key = Object.entries(getTableColumns(table)).find(([, column]) => column === target)![0]
        references.push({ table: tableConfig.name, column: target.name, source: table, key, target })
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
  /**
   * Moves the user to a new id, and every row in other tables that references them along. When `to` is taken, its
   * holder moves aside to a fresh id first.
   */
  async changeId(from, to) {
    const holder = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, to) })
    let moveAsideTo: number | undefined
    if (holder) {
      const [row] = await db.select({ maxId: sql<number>`coalesce(max(${schema.users.id}), 0)` }).from(schema.users)
      moveAsideTo = Math.max(Number(row?.maxId ?? 0), to) + 1
    }
    if (isPostgres()) return await changeIdPostgres(from, to, moveAsideTo)
    // SQLite: one batch with deferred foreign keys.
    const statements = [
      db.run(sql`PRAGMA defer_foreign_keys = ON`),
      ...(moveAsideTo === undefined ? [] : rekeyStatements(to, moveAsideTo)),
      ...rekeyStatements(from, to),
    ]
    await (db as unknown as { batch: (queries: unknown[]) => Promise<unknown> }).batch(statements)
  },
}

// Postgres can't defer foreign keys that weren't declared deferrable, so the user is copied to the new id, everything
// that references them is pointed at the copy, and the old row is removed - all in one transaction.
async function changeIdPostgres(from: number, to: number, moveAsideTo: number | undefined) {
  const uniqueTextKeys = Object.entries(getTableColumns(schema.users) as Record<string, Column>)
    .filter(([, column]) => column.isUnique && !column.primary && column.dataType === 'string')
    .map(([key]) => key)
  const references = userReferences()
  const transaction = (db as unknown as { transaction: <T>(run: (tx: typeof db) => Promise<T>) => Promise<T> }).transaction

  await transaction.call(db, async (tx) => {
    const rekey = async (oldId: number, newId: number) => {
      const [row] = await tx.select().from(schema.users).where(eq(schema.users.id, oldId))
      if (!row) return
      // Free the old row's unique values (e.g. `email`) so the copy can take them.
      if (uniqueTextKeys.length) {
        await tx.update(schema.users)
          .set(Object.fromEntries(uniqueTextKeys.map(key => [key, `${String(row[key as keyof typeof row])}#rekey-${oldId}`])))
          .where(eq(schema.users.id, oldId))
      }
      await tx.insert(schema.users).values({ ...row, id: newId })
      for (const reference of references) {
        await tx.update(reference.source as typeof schema.users).set({ [reference.key]: newId }).where(eq(reference.target, oldId))
      }
      for (const statement of rekeyUserAuthData(oldId, newId, tx)) await statement
      await tx.delete(schema.users).where(eq(schema.users.id, oldId))
    }
    if (moveAsideTo !== undefined) await rekey(to, moveAsideTo)
    await rekey(from, to)
    // Explicit ids don't advance the serial sequence; keep it past the highest id so new users don't collide.
    await (tx as unknown as { execute: (query: unknown) => Promise<unknown> }).execute(
      sql`select setval(pg_get_serial_sequence(${getTableName(schema.users)}, 'id'), (select coalesce(max(${schema.users.id}), 1) from ${schema.users}))`,
    )
  })
}

export default store
