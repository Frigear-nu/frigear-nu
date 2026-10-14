import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { patchTicketTypeRow, ticketTypePatchSchema } from '../../../utils/admin'
import { ticketTypeToMajor, ticketTypeToMinor } from '../../money'
import { updateTicketTypeShape } from '../../schemas'

export default defineScopedMcpTool({
  description: 'Update fields of an event\'s ticket type, such as price, capacity or sale dates (staff). Only the given fields change. The price is in whole currency units (52.2 = 52.20), not cents, in the given or the ticket type\'s current currency.',
  scopes: ['events:manage'],
  gate: canManageEvents,
  annotations: { idempotentHint: true },
  inputSchema: updateTicketTypeShape,
  handler: async ({ id, patch }) => {
    const [existing] = patch.price === undefined || patch.currency
      ? [undefined]
      : await db.select({ currency: schema.eventTicketTypes.currency }).from(schema.eventTicketTypes).where(eq(schema.eventTicketTypes.id, id)).limit(1)
    const row = await patchTicketTypeRow(id, ticketTypePatchSchema.parse(ticketTypeToMinor(patch, existing?.currency)))
    return ticketTypeToMajor(row)
  },
})
