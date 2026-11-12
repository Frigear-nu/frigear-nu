import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { idParams, notFound } from '@frigear-nu/module-kit/server'
import type { AdminAddonGroupDto } from '../../../../types'
import { addonGroupInput } from '../../utils/admin-schemas'

const patchSchema = addonGroupInput.omit({ addons: true }).partial()

export default defineEventHandler(async (event): Promise<AdminAddonGroupDto> => {
  await authorize(event, 'events:manage')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const patch = await readValidatedBody(event, patchSchema.parse)
  const [row] = await db.update(schema.eventAddonGroups).set(patch).where(eq(schema.eventAddonGroups.id, id)).returning()
  if (!row) throw notFound('Addon group not found.')
  return toAdminAddonGroupDto(row)
})
