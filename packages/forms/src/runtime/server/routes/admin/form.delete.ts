import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'

// Forms are never deleted (their submissions would lose their form): this archives.
export default defineEventHandler(async (event) => {
  await requireFormsManager(event)
  const current = await findFormById(getRouterParam(event, 'id')!)
  const [row] = await db.update(schema.forms).set({ status: 'archived' }).where(eq(schema.forms.id, current.id)).returning()
  return toAdminForm(row!)
})
