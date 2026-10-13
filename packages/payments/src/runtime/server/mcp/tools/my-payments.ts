import { z } from 'zod'

// Self only: includes membership (subscription) charges, which are stored as payments with reference type `subscription`.
export default defineScopedMcpTool({
  description: 'List your own payments, newest first: tickets, memberships and other charges with amount, status, refunds and what each was for.',
  scopes: ['payments:read'],
  annotations: { readOnlyHint: true },
  inputSchema: { limit: z.number().int().min(1).max(100).optional().describe('How many payments to return (default 50).') },
  handler: async ({ limit }, { user }) => ({ payments: await listUserPayments(user.id, { limit: limit ?? 50 }) }),
})
