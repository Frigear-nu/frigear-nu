import { z } from 'zod'
import { db, schema } from '@nuxthub/db'
import type { CreatedFormAccessTokenDto } from '../../../../types'

const input = z.object({ name: z.string().trim().min(1).max(100) })

// The only response that ever contains the token; only its hash is stored.
export default defineEventHandler(async (event): Promise<CreatedFormAccessTokenDto> => {
  await requireFormsManager(event)
  const form = await findFormById(getRouterParam(event, 'id')!)
  const { name } = await readValidatedBody(event, input.parse)
  const { id, token, tokenHash, prefix } = await generateToken()
  const [row] = await db.insert(schema.formAccessTokens).values({ id, formId: form.id, name, tokenHash, prefix }).returning()
  setResponseStatus(event, 201)
  return { ...toTokenDto(row!), token }
})
