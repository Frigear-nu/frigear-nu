import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { idParams, noContent } from '@frigear-nu/module-kit/server'

// A soft delete: forms are never removed (their submissions would lose their form), this archives. Archived
// forms stay listed (status `archived`) and can be published again with a PATCH.
export default defineEventHandler(async (event) => {
  await authorize(event, 'forms:manage')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const current = await findFormById(id)
  await db.update(schema.forms).set({ status: 'archived' }).where(eq(schema.forms.id, current.id))
  return noContent(event)
})
