import { z } from 'zod'
import { notFound } from '@frigear-nu/module-kit/server'
import type { EventDetailDto } from '../../../../types'

const paramsSchema = z.object({ slug: z.string().trim().min(1).max(128) })

export default defineEventHandler(async (event): Promise<EventDetailDto> => {
  const { slug } = await getValidatedRouterParams(event, paramsSchema.parse)
  const row = await getPublishedEventRow(slug)
  if (!row) throw notFound('Event not found.')

  // Personalised (membership / limits) only when somebody is signed in.
  // A token without `tickets:read` sees the anonymous view.
  const principal = await allows(event, 'tickets:read') ? await getAuth(event) : null
  return getEventDetail(row, principal?.user.id)
})
