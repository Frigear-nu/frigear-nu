import { z } from 'zod'
import { eventToMajor } from '../money'

export default defineScopedMcpTool({
  description: 'Get a published event with its ticket types and what you can buy. Prices are in whole currency units (52.2 = 52.20), not cents.',
  scopes: ['tickets:read'],
  annotations: { readOnlyHint: true },
  inputSchema: { slug: z.string().describe('The event slug.') },
  handler: async ({ slug }, { user }) => {
    const row = await getPublishedEventRow(slug)
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Event not found.' })
    return eventToMajor(await getEventDetail(row, user.id))
  },
})
