import type { EventDetailDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<EventDetailDto> => {
  const slug = getRouterParam(event, 'slug')!
  const row = await getPublishedEventRow(slug)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Event not found.' })

  // Personalised (membership / limits) only when somebody is signed in.
  const user = await getAuthUser(event, { scopes: ['tickets:read'] })
  return getEventDetail(row, user?.id)
})
