import { db, schema } from '@nuxthub/db'
import { eq, getTableName, sql } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/sqlite-core'

export type FrigearProfile = {
  email: string
  name?: string
  picture?: string
  emailVerified?: boolean
  // The frigear.nu user id (`sub`); only used when `forceId` is on.
  id?: number
}

type DbUser = typeof schema.users.$inferSelect

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
    db.run(sql`UPDATE ${sql.identifier(getTableName(schema.users))} SET id = ${to} WHERE id = ${from}`),
  ]
}

/** Changes a user's id, taking everything that references it along, in one batch with deferred foreign keys. */
async function rekeyUser(from: number, to: number, moveAsideTo?: number) {
  const statements = [
    db.run(sql`PRAGMA defer_foreign_keys = ON`),
    ...(moveAsideTo === undefined ? [] : rekeyStatements(to, moveAsideTo)),
    ...rekeyStatements(from, to),
  ]
  await (db as unknown as { batch: (queries: unknown[]) => Promise<unknown> }).batch(statements)
}

/**
 * Finds or creates the local user for a verified frigear.nu profile. Without `forceId` users are matched by email.
 * With `forceId` the local id is the frigear.nu id: a user with that id is updated; otherwise a user with the same
 * email is re-keyed to it (its relations follow, and whoever held the id is moved aside); otherwise a user is created
 * with that id.
 */
export async function syncFrigearUser(profile: FrigearProfile, options: { forceId: boolean }): Promise<DbUser> {
  const { email } = profile
  const verifiedAt = profile.emailVerified ? new Date() : undefined
  const fields = {
    name: profile.name || email,
    email,
    avatar: profile.picture,
    lastLoginAt: new Date(),
  }

  let user: DbUser | undefined

  if (options.forceId) {
    const id = profile.id
    if (!Number.isSafeInteger(id) || id! <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'frigear.nu did not return a numeric user id.' })
    }

    const byId = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, id!) })
    const byEmail = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, email) })

    if (byEmail && byEmail.id !== id) {
      // Whoever holds the frigear id (a different person) makes room by taking the next free id.
      let moveAsideTo: number | undefined
      if (byId) {
        const [row] = await db.select({ maxId: sql<number>`coalesce(max(${schema.users.id}), 0)` }).from(schema.users)
        moveAsideTo = Math.max(row?.maxId ?? 0, id!) + 1
      }
      await rekeyUser(byEmail.id, id!, moveAsideTo)
    }

    user = byEmail ?? byId
    user = user ? { ...user, id: id! } : undefined

    if (!user) {
      const [created] = await db.insert(schema.users).values({ id, ...fields, emailVerifiedAt: verifiedAt }).returning()
      return created!
    }

    const [updated] = await db.update(schema.users)
      .set({ ...fields, emailVerifiedAt: user.emailVerifiedAt ?? verifiedAt })
      .where(eq(schema.users.id, id!))
      .returning()
    return updated!
  }

  user = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.email, email) })
  if (!user) {
    const [created] = await db.insert(schema.users).values({ ...fields, emailVerifiedAt: verifiedAt }).returning()
    return created!
  }

  const [updated] = await db.update(schema.users)
    .set({ lastLoginAt: fields.lastLoginAt, emailVerifiedAt: user.emailVerifiedAt ?? verifiedAt })
    .where(eq(schema.users.id, user.id))
    .returning()
  return updated ?? user
}
