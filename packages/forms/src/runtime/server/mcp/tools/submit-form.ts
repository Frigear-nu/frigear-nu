import { z } from 'zod'

// Always submits as the signed-in caller: there is no user argument, and file uploads, per-form
// tokens and passwords (which a user token must not be mistaken for) are not available here.
export default defineScopedMcpTool({
  description: 'Submit a published form as yourself. Use get-form first to see the fields.',
  scopes: ['forms:submit'],
  annotations: { destructiveHint: false, idempotentHint: false },
  inputSchema: {
    slug: z.string(),
    answers: z.record(z.string(), z.unknown()).describe('Answers keyed by field key.'),
    locale: z.string().max(20).optional(),
  },
  handler: async ({ slug, answers, locale }, { event, user }) => {
    await enforceRateLimit(event, slug)
    const form = await findPublishedForm(slug)
    await assertMcpFormAccess(event, form)
    return processSubmission(event, form, user.id, { answers, locale: locale ?? 'en', uploads: new Map() })
  },
})
