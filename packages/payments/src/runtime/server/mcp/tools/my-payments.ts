import { z } from 'zod'
import { fieldsFromCents } from '@frigear-nu/mcp/utils'

// Self only: includes membership (subscription) charges, which are stored as payments with reference type `subscription`.
export default defineScopedMcpTool({
  description: 'List your own payments, newest first: tickets, memberships and other charges with amount, status, refunds and what each was for. Amounts are in whole currency units (52.2 = 52.20), not cents.',
  scopes: ['payments:read'],
  annotations: { readOnlyHint: true },
  inputSchema: { limit: z.number().int().min(1).max(100).optional().describe('How many payments to return (default 50).') },
  handler: async ({ limit }, { user }) => ({
    payments: (await listUserPayments(user.id, { limit: limit ?? 50 })).map(payment =>
      fieldsFromCents({ ...payment, currency: payment.currency.toUpperCase() }, ['amount', 'refundedAmount'], payment.currency)),
  }),
})
