import type { InboxChannelDefinition, InboxChannelInfo, InboxExtension } from '../../types'

/** Channel ids: lower case words joined by `.`, `_` or `-` (`email`, `acme.sms`). */
export const INBOX_CHANNEL_ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/

/** The built registry: what the app sees of each channel, and the server file of each adapter. */
export type BuiltInboxRegistry = {
  channels: Record<string, InboxChannelInfo>
  adapters: Record<string, string>
}

/**
 * Merges channel registrations in order (built-ins, then every `extendInbox` call, then the host's own): a later
 * definition with the same id replaces an earlier one, so a host can swap the adapter of a built-in channel. Returns
 * the issues of invalid definitions instead of throwing, so the module can list them all.
 */
export function buildInboxRegistry(extensions: InboxExtension[]): { registry: BuiltInboxRegistry, issues: string[] } {
  const issues: string[] = []
  const merged = new Map<string, InboxChannelDefinition>()
  for (const extension of extensions) {
    for (const channel of extension.channels ?? []) {
      const id = typeof channel?.id === 'string' ? channel.id : ''
      if (!INBOX_CHANNEL_ID.test(id)) {
        issues.push(`channel "${id}": the id must be lower case words joined by ".", "_" or "-"`)
        continue
      }
      if (!channel.label || (typeof channel.label !== 'string' && typeof channel.label !== 'object')) {
        issues.push(`channel "${id}": a label is required`)
        continue
      }
      if (typeof channel.adapter !== 'string' || !channel.adapter) {
        issues.push(`channel "${id}": \`adapter\` must be the path of a server file default-exporting defineInboxChannel()`)
        continue
      }
      merged.set(id, channel)
    }
  }
  const registry: BuiltInboxRegistry = { channels: {}, adapters: {} }
  for (const [id, channel] of merged) {
    registry.channels[id] = { id, label: channel.label, ...(channel.icon ? { icon: channel.icon } : {}) }
    registry.adapters[id] = channel.adapter
  }
  return { registry, issues }
}

/**
 * Merges inbound email driver registrations in order (built-ins, then every `extendInbox` call, then the host's own):
 * a later driver with the same name replaces an earlier one. Returns the drivers by name and the issues of invalid
 * ones instead of throwing.
 */
export function buildInboxEmailDrivers(extensions: InboxExtension[]): { drivers: Record<string, string>, issues: string[] } {
  const issues: string[] = []
  const drivers: Record<string, string> = {}
  for (const extension of extensions) {
    for (const definition of extension.emailDrivers ?? []) {
      const name = typeof definition?.name === 'string' ? definition.name : ''
      if (!INBOX_CHANNEL_ID.test(name)) {
        issues.push(`email driver "${name}": the name must be lower case words joined by ".", "_" or "-"`)
        continue
      }
      if (typeof definition.driver !== 'string' || !definition.driver) {
        issues.push(`email driver "${name}": \`driver\` must be the path of a server file default-exporting defineInboxEmailDriver()`)
        continue
      }
      drivers[name] = definition.driver
    }
  }
  return { drivers, issues }
}
