import type { EventDetailDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<EventDetailDto> => {
  const slug = getRouterParam(event, 'slug')!
  const row = await getPublishedEventRow(slug)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Event not found.' })

  // Personalised (membership / limits) only when somebody is signed in.
  const session = await getUserSession(event)
  return getEventDetail(row, session.user?.id)
})
