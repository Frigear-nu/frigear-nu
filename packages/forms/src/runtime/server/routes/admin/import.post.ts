import { importInput } from '../../utils/admin-schemas'

// Explicit, admin-triggered import: inserts forms whose slug is new, skips the rest.
export default defineEventHandler(async (event) => {
  await requireFormsManager(event)
  const { forms } = await readValidatedBody(event, importInput.parse)
  return seedForms(forms.map(form => ({ ...form, definition: form.definition })))
})
