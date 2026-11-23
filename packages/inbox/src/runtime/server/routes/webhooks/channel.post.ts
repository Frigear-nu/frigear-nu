import { notConfigured, notFound } from '@frigear-nu/module-kit/server'

// The webhook of a channel another module registered with an `inbound` reader. It fails closed: the adapter must name
// a secret (`inboundSecret`) that is configured in `inbox.secrets`, otherwise every request is a 501 `not_configured`
// before the body is read. The body is read here with the webhook size limit (413 `payload_too_large`, with or without
// a content-length) and handed to the adapter (`rawBody`), which verifies the request with the secret (and throws a
// 401 when it does not hold) and returns the messages; they are stored like those of the built-in channels.
export default defineEventHandler(async (event) => {
  const { channel } = await getValidatedRouterParams(event, inboxChannelParams.parse)
  const adapter = inboxChannelAdapter(channel)
  if (!adapter?.inbound) throw notFound('This channel has no webhook.')
  const secret = inboxSecret(adapter.inboundSecret, event)
  if (!secret) throw notConfigured(`The ${channel} webhook has no secret (inboundSecret${adapter.inboundSecret ? ` ${adapter.inboundSecret} in inbox.secrets` : ''}).`)
  const rawBody = await inboxReadRawBody(event)
  const messages = await adapter.inbound(event, { secret, rawBody })
  return inboxReceiveAll(event, channel, messages)
})
