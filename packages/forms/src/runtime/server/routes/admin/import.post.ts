import type { FormImportResultDto } from '../../../../types'
import { importInput } from '../../utils/admin-schemas'

// Explicit, admin-triggered import: inserts forms whose slug is new, skips the rest.
export default defineEventHandler(async (event): Promise<FormImportResultDto> => {
  await formsStaff.require(event)
  const { forms } = await readValidatedBody(event, importInput.parse)
  const { inserted, skipped } = await seedForms(forms.map(form => ({ ...form, definition: form.definition })))
  return { inserted, skipped }
})
