import { notFound } from '@frigear-nu/module-kit/server'

// The webhook of a channel another module registered with an `inbound` reader. The adapter verifies the request (and
// throws a 401 when it does not hold) and returns the messages; they are stored like those of the built-in channels.
export default defineEventHandler(async (event) => {
  const { channel } = await getValidatedRouterParams(event, inboxChannelParams.parse)
  const adapter = inboxChannelAdapter(channel)
  if (!adapter?.inbound) throw notFound('This channel has no webhook.')
  const messages = await adapter.inbound(event)
  return inboxReceiveAll(event, channel, messages)
})
