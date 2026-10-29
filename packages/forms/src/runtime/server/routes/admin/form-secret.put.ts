import { z } from 'zod'
import type { FormSecretsDto } from '../../../../types'
import { secretParams } from '../../utils/admin-schemas'

const input = z.object({ value: z.string().trim().min(1).max(2000) })

// Write-only: the value is encrypted and stored, and is not part of the response.
export default defineEventHandler(async (event): Promise<FormSecretsDto> => {
  await formsStaff.require(event, { sessionOnly: true })
  const { id, key } = await getValidatedRouterParams(event, secretParams.parse)
  const { value } = await readValidatedBody(event, input.parse)
  const form = await findFormById(id)
  await setFormSecret(form.id, key, value)
  return describeFormSecrets(event, form.id)
})
