import { z } from 'zod'
import { db, schema } from '@nuxthub/db'
import type { FormPasswordStatusDto } from '../../../../types'

const input = z.object({ password: z.string().min(6).max(200) })

export default defineEventHandler(async (event): Promise<FormPasswordStatusDto> => {
  await requireFormsManager(event)
  const form = await findFormById(getRouterParam(event, 'id')!)
  const { password } = await readValidatedBody(event, input.parse)
  const passwordHash = await hashPassword(password)
  await db.insert(schema.formAccess).values({ formId: form.id, passwordHash }).onConflictDoUpdate({
    target: schema.formAccess.formId,
    set: { passwordHash, updatedAt: new Date() },
  })
  return { set: true }
})
