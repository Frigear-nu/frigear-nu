import { z } from 'zod'
import { noContent } from '@frigear-nu/module-kit/server'

const bodySchema = z.object({ token: z.string().trim().min(1).max(4096), secret: z.string().min(16).max(256) })

// Removes the caller's device by its token and the installation secret, for the app itself (sign-out). Idempotent: a
// token that is unknown, belongs to another user or is bound to another secret answers 204 too and is left alone.
export default defineEventHandler(async (event) => {
  const { user } = await authorize(event, 'push:devices')
  const { token, secret } = await readValidatedBody(event, bodySchema.parse)
  await removePushDeviceByToken(user.id, token, secret)
  return noContent(event)
})
