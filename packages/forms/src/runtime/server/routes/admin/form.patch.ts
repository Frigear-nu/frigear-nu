import { eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { formPatch } from '../../utils/admin-schemas'

export default defineEventHandler(async (event) => {
  await requireFormsManager(event)
  const current = await findFormById(getRouterParam(event, 'id')!)
  const input = await readValidatedBody(event, formPatch.parse)

  if (input.slug && input.slug !== current.slug && await findFormBySlug(input.slug)) {
    throw createError({ statusCode: 409, statusMessage: 'A form with this slug already exists.' })
  }
  // A changed definition is a new version; submissions keep the snapshot they were made against.
  const definitionChanged = input.definition !== undefined && JSON.stringify(input.definition) !== JSON.stringify(current.definition)
  const [row] = await db.update(schema.forms).set({
    ...input,
    version: definitionChanged ? current.version + 1 : current.version,
  }).where(eq(schema.forms.id, current.id)).returning()
  return toAdminForm(row!)
})
