import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { created, idParams, notFound } from '@frigear-nu/module-kit/server'
import type { AdminAddonDto } from '../../../../types'
import { newId } from '../../../utils'
import { addonInput } from '../../utils/admin-schemas'

// Adds an addon (one choice) to the addon group `:id`.
export default defineEventHandler(async (event): Promise<AdminAddonDto> => {
  await authorize(event, 'events:manage')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const input = await readValidatedBody(event, addonInput.parse)
  const [parent] = await db.select({ id: schema.eventAddonGroups.id }).from(schema.eventAddonGroups).where(eq(schema.eventAddonGroups.id, id)).limit(1)
  if (!parent) throw notFound('Addon group not found.')
  const [row] = await db.insert(schema.eventAddons)
    .values({ id: newId('adn'), groupId: id, ...input, description: input.description ?? null, capacity: input.capacity ?? null })
    .returning()
  return created(event, toAdminAddonDto(row!))
})
