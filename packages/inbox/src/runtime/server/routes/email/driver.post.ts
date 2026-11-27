import { z } from 'zod'
import { notFound } from '@frigear-nu/module-kit/server'
import { INBOX_CHANNEL_ID } from '../../../utils/registry'

// `POST /api/inbox/email/:driver`: the webhook of an inbound email driver that has a `handler` (Resend's
// `email.received`, a host's own provider). The driver verifies the request itself and fails closed without its
// secret; a driver without a handler, or none by that name, is a 404.
export default defineEventHandler(async (event) => {
  const { driver: name } = await getValidatedRouterParams(event, z.object({ driver: z.string().trim().regex(INBOX_CHANNEL_ID).max(64) }).parse)
  const driver = inboxEmailDriver(name)
  if (!driver?.handler) throw notFound('This email driver has no webhook.')
  return driver.handler(event)
})
