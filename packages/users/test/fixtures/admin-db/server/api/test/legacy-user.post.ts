import { db, schema } from '@nuxthub/db'

// Test only: stores a user exactly as given (a mixed-case email, as rows written before emails were normalised), to
// check that lookups and the duplicate check ignore case.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ name: string, email: string, password: string }>(event)
  const [user] = await db.insert(schema.users).values({
    name: body.name,
    email: body.email,
    password: await hashPassword(body.password),
  } as typeof schema.users.$inferInsert).returning()
  return { id: user!.id, email: user!.email }
})
