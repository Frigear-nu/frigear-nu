import { z } from 'zod'
import type { FormSecretsDto } from '../../../../types'

const input = z.object({
  key: z.string().refine(isFormSecretKey, 'Unknown secret key.'),
  value: z.string().trim().min(1).max(2000),
})

// Write-only: the value is encrypted and stored, and is not part of the response.
export default defineEventHandler(async (event): Promise<FormSecretsDto> => {
  await requireFormsManager(event)
  const form = await findFormById(getRouterParam(event, 'id')!)
  const { key, value } = await readValidatedBody(event, input.parse)
  await setFormSecret(form.id, key, value)
  return describeFormSecrets(event, form.id)
})
