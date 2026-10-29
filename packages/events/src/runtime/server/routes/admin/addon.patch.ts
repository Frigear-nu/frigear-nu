import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { idParams, notFound } from '@frigear-nu/module-kit/server'
import type { AdminAddonDto } from '../../../../types'
import { addonInput } from '../../utils/admin-schemas'

const patchSchema = addonInput.partial()

export default defineEventHandler(async (event): Promise<AdminAddonDto> => {
  await eventsStaff.require(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const patch = await readValidatedBody(event, patchSchema.parse)
  const [row] = await db.update(schema.eventAddons).set(patch).where(eq(schema.eventAddons.id, id)).returning()
  if (!row) throw notFound('Addon not found.')
  return toAdminAddonDto(row)
})
