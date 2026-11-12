import { z } from 'zod'
import { formInput } from '../../../utils/admin-schemas'
import { DELIVERY_NOTICE, deliveryRefusal, formDefinitionInput, formSlug } from '../../schemas'

export default defineScopedMcpTool({
  description: `Create a form (staff). It starts as a draft unless a status is given. New forms have no delivery settings; ${DELIVERY_NOTICE}`,
  permission: 'forms:manage',
  annotations: { destructiveHint: false },
  inputSchema: {
    slug: formSlug,
    name: z.string().min(1).max(200),
    status: z.enum(['draft', 'published', 'archived']).optional(),
    definition: formDefinitionInput,
  },
  handler: async (args) => {
    // Where answers are delivered (emails, webhooks) is a data-exfiltration lever: staff set it in the admin UI only.
    if ('delivery' in args.definition) throw deliveryRefusal()
    const row = await createForm(formInput.parse(args))
    const { delivery: _delivery, ...definition } = row.definition
    return { id: row.id, slug: row.slug, name: row.name, status: row.status, version: row.version, definition }
  },
})
