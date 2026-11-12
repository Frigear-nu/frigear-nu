import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { idParams, notFound } from '@frigear-nu/module-kit/server'
import type { AdminEventDto } from '../../../../types'
import { eventPatchSchema, patchEventRow } from '../../utils/admin'

export default defineEventHandler(async (event): Promise<AdminEventDto> => {
  await authorize(event, 'events:manage')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const [existing] = await db.select().from(schema.events).where(eq(schema.events.id, id)).limit(1)
  if (!existing) throw notFound('Event not found.')
  // Record-level policies of `events:manage` see the stored event before anything changes.
  await authorize(event, 'events:manage', existing)
  const patch = await readValidatedBody(event, eventPatchSchema.parse)
  return toAdminEventDto(await patchEventRow(id, patch))
})
