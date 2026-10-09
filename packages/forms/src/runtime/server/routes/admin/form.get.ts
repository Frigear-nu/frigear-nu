export default defineEventHandler(async (event) => {
  await requireFormsManager(event)
  return toAdminForm(await findFormById(getRouterParam(event, 'id')!))
})
