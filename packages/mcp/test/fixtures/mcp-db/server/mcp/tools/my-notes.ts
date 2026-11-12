import { notes } from '../../utils/notes'

export default defineScopedMcpTool({
  description: 'List my own notes',
  permission: 'notes:read',
  handler: (_args, { user }) => notes.filter(note => note.ownerId === user.id).map(({ id, text }) => ({ id, text })),
})
