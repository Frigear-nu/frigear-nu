import { z } from 'zod'
import { created } from '@frigear-nu/module-kit/server'
import type { PushDeviceDto } from '../../../../types'

const bodySchema = z.object({
  platform: z.enum(['ios', 'android']),
  token: z.string().trim().min(1).max(4096),
  // Who issued the token. An iOS app that registers its FCM token sends `fcm`; unset is FCM on Android and `push.ios`
  // on iOS. Android tokens are always FCM tokens.
  provider: z.enum(['fcm', 'apns']).optional(),
  // The token this installation registered before (its APNs token, once it registers its FCM token): removed.
  replaces: z.string().trim().min(1).max(4096).optional(),
  // The installation secret the app generated once (stored as a hash): needed to take over a token registered to
  // another user (the phone changed hands), and for `replaces`.
  secret: z.string().min(16).max(256).optional(),
  appId: z.string().trim().min(1).max(255).optional(),
  locale: z.string().trim().min(1).max(35).optional(),
}).refine(body => !(body.platform === 'android' && body.provider === 'apns'), {
  message: 'An Android device has an FCM token.',
  path: ['provider'],
}).refine(body => !body.replaces || body.secret, {
  message: 'Replacing a token needs the installation secret.',
  path: ['secret'],
})

// Registers the calling device, so the app can call this on every start. A token already registered to the caller is
// active again; one registered to another user moves only with the installation's `secret` (else 409 `device_owned`).
// `replaces` removes the caller's device with the installation's previous token, when bound to the same secret.
export default defineEventHandler(async (event): Promise<PushDeviceDto> => {
  const { user } = await authorize(event, 'push:devices')
  const body = await readValidatedBody(event, bodySchema.parse)
  return created(event, await registerPushDevice(event, user.id, body))
})
