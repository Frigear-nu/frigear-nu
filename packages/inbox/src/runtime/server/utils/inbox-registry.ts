import { adapters, channels } from '#inbox/server-registry'
import type { InboxChannelAdapter, InboxChannelInfo } from '../../../types'

// The channels built at build time from the built-ins and every `extendInbox` call (`#inbox/server-registry`).

/** A registered channel, or `undefined`. */
export function inboxChannel(id: string): InboxChannelInfo | undefined {
  return Object.hasOwn(channels, id) ? channels[id] : undefined
}

/** Every registered channel. */
export function inboxChannels(): InboxChannelInfo[] {
  return Object.values(channels)
}

/** The adapter of a registered channel, or `undefined`. */
export function inboxChannelAdapter(id: string): InboxChannelAdapter | undefined {
  return Object.hasOwn(adapters, id) ? adapters[id] : undefined
}
