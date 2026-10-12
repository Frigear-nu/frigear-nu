import { z } from 'zod'

export default defineScopedMcpTool({
  description: 'Get a published event with its ticket types and what you can buy.',
  scopes: ['tickets:read'],
  annotations: { readOnlyHint: true },
  inputSchema: { slug: z.string().describe('The event slug.') },
  handler: async ({ slug }, { user }) => {
    const row = await getPublishedEventRow(slug)
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Event not found.' })
    return getEventDetail(row, user.id)
  },
})
