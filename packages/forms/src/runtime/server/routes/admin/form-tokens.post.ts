import { z } from 'zod'
import { db, schema } from '@nuxthub/db'
import { created, idParams } from '@frigear-nu/module-kit/server'
import type { CreatedFormAccessTokenDto } from '../../../../types'

const input = z.object({ name: z.string().trim().min(1).max(100) })

// The only response that ever contains the token; only its hash is stored. Minting a credential needs a session.
export default defineEventHandler(async (event): Promise<CreatedFormAccessTokenDto> => {
  await formsStaff.require(event, { sessionOnly: true })
  const { id: formId } = await getValidatedRouterParams(event, idParams().parse)
  const { name } = await readValidatedBody(event, input.parse)
  const form = await findFormById(formId)
  const { id, token, tokenHash, prefix } = await generateToken()
  const [row] = await db.insert(schema.formAccessTokens).values({ id, formId: form.id, name, tokenHash, prefix }).returning()
  return created(event, { ...toFormTokenDto(row!), token })
})
