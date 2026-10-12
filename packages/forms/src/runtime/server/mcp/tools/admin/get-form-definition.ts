import { z } from 'zod'
import { DELIVERY_NOTICE } from '../../schemas'

export default defineScopedMcpTool({
  description: `Get a form including its draft/archived status (staff). Delivery settings are never returned. ${DELIVERY_NOTICE}`,
  scopes: ['forms:manage'],
  gate: canManageForms,
  annotations: { readOnlyHint: true },
  inputSchema: { id: z.string() },
  handler: async ({ id }) => {
    const row = await findFormById(id)
    const { delivery: _delivery, ...definition } = row.definition
    return { id: row.id, slug: row.slug, name: row.name, status: row.status, version: row.version, definition }
  },
})
