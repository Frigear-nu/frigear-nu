import { z } from 'zod'

export default defineScopedMcpTool({
  description: 'Get the definition (fields) of a published form so you can fill it in.',
  scopes: ['forms:submit'],
  annotations: { readOnlyHint: true },
  inputSchema: { slug: z.string() },
  handler: async ({ slug }, { event }) => {
    const form = await findPublishedForm(slug)
    await assertMcpFormAccess(event, form)
    return toPublicForm(form)
  },
})
