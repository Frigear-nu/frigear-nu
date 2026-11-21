import { z } from 'zod'
import { created } from '@frigear-nu/module-kit/server'
import type { PushDeviceDto } from '../../../../types'

const bodySchema = z.object({
  platform: z.enum(['ios', 'android', 'web']),
  token: z.string().trim().min(1).max(4096),
  appId: z.string().trim().min(1).max(255).optional(),
  locale: z.string().trim().min(1).max(35).optional(),
})

// Registers the calling device. A token that is already registered moves to the caller and is active again, so the
// app can call this on every start.
export default defineEventHandler(async (event): Promise<PushDeviceDto> => {
  const { user } = await authorize(event, 'push:devices')
  const body = await readValidatedBody(event, bodySchema.parse)
  return created(event, await registerPushDevice(event, user.id, body))
})
