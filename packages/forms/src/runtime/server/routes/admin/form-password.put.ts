import { z } from 'zod'
import { db, schema } from '@nuxthub/db'
import { idParams } from '@frigear-nu/module-kit/server'
import type { FormPasswordStatusDto } from '../../../../types'

const input = z.object({ password: z.string().min(6).max(200) })

// Sets (or replaces) the shared password. A credential, so only from a signed-in session.
export default defineEventHandler(async (event): Promise<FormPasswordStatusDto> => {
  await formsStaff.require(event, { sessionOnly: true })
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const { password } = await readValidatedBody(event, input.parse)
  const form = await findFormById(id)
  const passwordHash = await hashPassword(password)
  await db.insert(schema.formAccess).values({ formId: form.id, passwordHash }).onConflictDoUpdate({
    target: schema.formAccess.formId,
    set: { passwordHash, updatedAt: new Date() },
  })
  return { set: true }
})
