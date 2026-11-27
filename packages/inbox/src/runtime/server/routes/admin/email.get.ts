import { inboxAccess } from '../../../access'
import type { InboxEmailSettingsDto } from '../../../../types'

// How email reaches the inbox on this server, for the settings page: the inbox domains and the inbound email drivers.
// Session only, like the channels.
export default defineEventHandler(async (event): Promise<InboxEmailSettingsDto> => {
  await authorize(event, inboxAccess.permissions.channels)
  return { domains: inboxDomains(event), drivers: inboxEmailDriverNames() }
})
