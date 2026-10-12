import { z } from 'zod'
import { notes } from '../../../utils/notes'
import { canManageNotes } from '../../../utils/gate'

export default defineScopedMcpTool({
  description: 'List every note (manager only); owner email needs notes:pii',
  scopes: ['notes:manage'],
  gate: canManageNotes,
  inputSchema: { limit: z.number().optional() },
  handler: ({ limit }, ctx) => notes.slice(0, limit ?? 10).map(note => redactPii(pick(note, ['id', 'ownerId', 'ownerEmail', 'text']), { allow: ctx.hasScope('notes:pii'), fields: ['ownerEmail'] })),
})
