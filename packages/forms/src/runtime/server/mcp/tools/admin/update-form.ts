import { z } from 'zod'
import { formPatch } from '../../../utils/admin-schemas'
import { DELIVERY_NOTICE, deliveryRefusal, formDefinitionInput, formSlug } from '../../schemas'

export default defineScopedMcpTool({
  description: `Update a form (staff). A changed definition creates a new version; earlier submissions keep theirs. Existing delivery settings are kept unchanged. ${DELIVERY_NOTICE}`,
  scopes: ['forms:manage'],
  gate: canManageForms,
  annotations: { idempotentHint: true },
  inputSchema: {
    id: z.string(),
    slug: formSlug.optional(),
    name: z.string().min(1).max(200).optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
    definition: formDefinitionInput.optional(),
  },
  handler: async ({ id, ...patch }) => {
    const current = await findFormById(id)
    if (patch.definition && 'delivery' in patch.definition) throw deliveryRefusal()
    // The definition replaces the old one, so the existing delivery settings are carried over untouched.
    const definition = patch.definition ? { ...patch.definition, ...(current.definition.delivery ? { delivery: current.definition.delivery } : {}) } : undefined
    const row = await patchForm(id, formPatch.parse({ ...patch, definition }))
    const { delivery: _delivery, ...visible } = row.definition
    return { id: row.id, slug: row.slug, name: row.name, status: row.status, version: row.version, definition: visible }
  },
})
