import { formPatch } from '../../utils/admin-schemas'

export default defineEventHandler(async (event) => {
  await requireFormsManager(event)
  const id = getRouterParam(event, 'id')!
  await findFormById(id)
  const input = await readValidatedBody(event, formPatch.parse)
  return toAdminForm(await patchForm(id, input))
})
