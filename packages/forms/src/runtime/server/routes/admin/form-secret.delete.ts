import type { FormSecretsDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<FormSecretsDto> => {
  await requireFormsManager(event)
  const form = await findFormById(getRouterParam(event, 'id')!)
  const key = getRouterParam(event, 'key')!
  if (!isFormSecretKey(key)) throw createError({ statusCode: 400, statusMessage: 'Unknown secret key.' })
  await deleteFormSecret(form.id, key)
  return describeFormSecrets(event, form.id)
})
