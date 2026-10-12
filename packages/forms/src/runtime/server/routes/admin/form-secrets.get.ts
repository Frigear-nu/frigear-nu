import type { FormSecretsDto } from '../../../../types'

// Names and sources only; secret values never leave the server.
export default defineEventHandler(async (event): Promise<FormSecretsDto> => {
  await requireFormsManager(event)
  const form = await findFormById(getRouterParam(event, 'id')!)
  return describeFormSecrets(event, form.id)
})
