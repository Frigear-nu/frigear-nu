import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { idParams, noContent } from '@frigear-nu/module-kit/server'
import { operationsAccess } from '../../../access'

// Deletes an operation. Modules that attach to it (crew, shifts, maps) keep their own rows: archive an operation that
// has been worked instead.
export default defineEventHandler(async (event) => {
  await authorize(event, operationsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const existing = await getOperationOr404(id)
  await authorize(event, operationsAccess.permissions.manage, existing)
  await db.delete(schema.operations).where(eq(schema.operations.id, id))
  return noContent(event)
})
