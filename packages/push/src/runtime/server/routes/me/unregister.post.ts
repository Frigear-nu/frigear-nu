import { z } from 'zod'
import { noContent } from '@frigear-nu/module-kit/server'

const bodySchema = z.object({ token: z.string().trim().min(1).max(4096) })

// Removes the caller's device by its token, for an app that only knows the token (sign-out). Idempotent: a token that
// is unknown, or belongs to another user, answers 204 too and is left alone.
export default defineEventHandler(async (event) => {
  const { user } = await authorize(event, 'push:devices')
  const { token } = await readValidatedBody(event, bodySchema.parse)
  await removePushDeviceByToken(user.id, token)
  return noContent(event)
})
