import { z } from 'zod'
import { created } from '@frigear-nu/module-kit/server'
import type { PushDeviceDto } from '../../../../types'

const bodySchema = z.object({
  platform: z.enum(['ios', 'android']),
  token: z.string().trim().min(1).max(4096),
  // Who issued the token. An iOS app that registers its FCM token sends `fcm`; unset is FCM on Android and `push.ios`
  // on iOS. Android tokens are always FCM tokens.
  provider: z.enum(['fcm', 'apns']).optional(),
  appId: z.string().trim().min(1).max(255).optional(),
  locale: z.string().trim().min(1).max(35).optional(),
}).refine(body => !(body.platform === 'android' && body.provider === 'apns'), {
  message: 'An Android device has an FCM token.',
  path: ['provider'],
})

// Registers the calling device. A token that is already registered moves to the caller and is active again, so the
// app can call this on every start.
export default defineEventHandler(async (event): Promise<PushDeviceDto> => {
  const { user } = await authorize(event, 'push:devices')
  const body = await readValidatedBody(event, bodySchema.parse)
  return created(event, await registerPushDevice(event, user.id, body))
})
