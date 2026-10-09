import { db, schema } from '@nuxthub/db'
import { newId } from '../../../utils'
import { formInput } from '../../utils/admin-schemas'

export default defineEventHandler(async (event) => {
  await requireFormsManager(event)
  const input = await readValidatedBody(event, formInput.parse)

  if (await findFormBySlug(input.slug)) {
    throw createError({ statusCode: 409, statusMessage: 'A form with this slug already exists.' })
  }
  const [row] = await db.insert(schema.forms).values({ id: newId('frm'), ...input }).returning()
  setResponseStatus(event, 201)
  return toAdminForm(row!)
})
