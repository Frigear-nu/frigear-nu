import { z } from 'zod'
import { apiError, notConfigured } from '@frigear-nu/module-kit/server'
import { timingSafeEqual } from '../../../utils/signature'

const verifyQuery = z.object({
  'hub.mode': z.string().max(32).default(''),
  'hub.verify_token': z.string().max(512).default(''),
  'hub.challenge': z.string().max(200).default(''),
})

// Meta's subscription check: `hub.mode=subscribe`, the verify token entered in the app's webhook settings, and a
// challenge echoed back as plain text. Anything else is a 403.
export default defineEventHandler(async (event) => {
  const verifyToken = inboxConfig(event).meta.verifyToken
  if (!verifyToken) throw notConfigured('The Meta webhook has no verify token (inbox.meta.verifyToken).')
  const query = await getValidatedQuery(event, verifyQuery.parse)
  const challenge = query['hub.challenge']
  if (query['hub.mode'] !== 'subscribe' || !challenge || !timingSafeEqual(query['hub.verify_token'], verifyToken)) {
    throw apiError(403, 'invalid_verify_token', 'The verify token does not match.')
  }
  setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return challenge
})
