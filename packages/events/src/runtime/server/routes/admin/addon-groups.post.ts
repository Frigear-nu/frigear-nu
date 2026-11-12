import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { created, idParams, notFound } from '@frigear-nu/module-kit/server'
import type { AdminAddonGroupDto } from '../../../../types'
import { insertAddonGroup } from '../../utils/admin'
import { addonGroupInput } from '../../utils/admin-schemas'

// Adds an addon group (optionally with its addons) to the ticket type `:id`.
export default defineEventHandler(async (event): Promise<AdminAddonGroupDto> => {
  await authorize(event, 'events:manage')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const input = await readValidatedBody(event, addonGroupInput.parse)
  const [parent] = await db.select({ id: schema.eventTicketTypes.id }).from(schema.eventTicketTypes).where(eq(schema.eventTicketTypes.id, id)).limit(1)
  if (!parent) throw notFound('Ticket type not found.')
  return created(event, toAdminAddonGroupDto(await insertAddonGroup(id, input)))
})
