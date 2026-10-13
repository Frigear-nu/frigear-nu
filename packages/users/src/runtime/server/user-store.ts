import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { AuthUserStore } from '@frigear-nu/auth/utils'

// The user store `@frigear-nu/auth` reads and writes users through: sign-in flows and bearer credentials. It reads
// the database on every call, so role changes apply immediately instead of at the user's next login like the session
// snapshot.
const asId = (id: string | number) => {
  const numeric = Number(id)
  return Number.isSafeInteger(numeric) ? numeric : null
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
}

export default store
