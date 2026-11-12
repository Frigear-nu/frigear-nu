import { z } from 'zod'
import { notes } from '../../../utils/notes'

export default defineScopedMcpTool({
  description: 'List every note (manager only); owner email needs notes:pii',
  permission: 'notes:manage',
  inputSchema: { limit: z.number().optional() },
  handler: async ({ limit }, ctx) => {
    const allow = await ctx.can('notes:pii')
    return notes.slice(0, limit ?? 10).map(note => redactPii(pick(note, ['id', 'ownerId', 'ownerEmail', 'text']), { allow, fields: ['ownerEmail'] }))
  },
})
