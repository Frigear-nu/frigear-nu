import { db, schema } from '@nuxthub/db'
import { created, idParams, uniqueCopySlug } from '@frigear-nu/module-kit/server'
import type { FormAdminDto } from '../../../../types'
import { newId } from '../../../utils'

// Copies a form's name and definition into a new draft. Submissions, tokens, the password and secrets
// belong to the original and are not copied.
export default defineEventHandler(async (event): Promise<FormAdminDto> => {
  await formsStaff.require(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const source = await findFormById(id)

  const slug = await uniqueCopySlug(source.slug, findFormBySlug)
  const [row] = await db.insert(schema.forms).values({
    id: newId('frm'),
    slug,
    name: `${source.name} (copy)`,
    status: 'draft',
    definition: source.definition,
  }).returning()
  return created(event, toAdminForm(row!))
})
