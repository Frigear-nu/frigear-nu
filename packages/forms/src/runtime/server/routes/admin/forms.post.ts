import { formInput } from '../../utils/admin-schemas'

export default defineEventHandler(async (event) => {
  await requireFormsManager(event)
  const input = await readValidatedBody(event, formInput.parse)
  const row = await createForm(input)
  setResponseStatus(event, 201)
  return toAdminForm(row)
})
