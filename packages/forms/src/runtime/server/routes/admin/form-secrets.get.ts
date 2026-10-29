import { idParams } from '@frigear-nu/module-kit/server'
import type { FormSecretsDto } from '../../../../types'

// Names and sources only; secret values never leave the server.
export default defineEventHandler(async (event): Promise<FormSecretsDto> => {
  await formsStaff.require(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const form = await findFormById(id)
  return describeFormSecrets(event, form.id)
})
