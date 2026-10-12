import { db, schema } from '@nuxthub/db'
import { newId } from '../../../utils'

// Copies a form's name and definition into a new draft. Submissions, tokens, the password and secrets
// belong to the original and are not copied.
export default defineEventHandler(async (event) => {
  await requireFormsManager(event)
  const source = await findFormById(getRouterParam(event, 'id')!)

  let slug = `${source.slug}-copy`
  for (let n = 2; await findFormBySlug(slug); n++) slug = `${source.slug}-copy-${n}`

  const [row] = await db.insert(schema.forms).values({
    id: newId('frm'),
    slug,
    name: `${source.name} (copy)`,
    status: 'draft',
    definition: source.definition,
  }).returning()
  setResponseStatus(event, 201)
  return toAdminForm(row!)
})
