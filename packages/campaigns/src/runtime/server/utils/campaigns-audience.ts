import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, countDistinct, eq, gt, inArray } from 'drizzle-orm'
import type { Grant } from '@frigear-nu/auth/grants'
import { apiError, inChunks, validationError } from '@frigear-nu/module-kit/server'
import type { CampaignAudience, CampaignChannel, CampaignPreviewDto, CampaignSendChannel } from '../../../types'
import type { CampaignRow } from './campaigns-campaigns'

// Who a campaign reaches. To lists: the active subscriptions of its lists on its channels, each contact once per
// channel. A message: the users of its `userIds` and the members of its grants (`grantsMembers`), each once.

const notResolved = () => apiError(400, 'audience_not_resolved', 'Nobody matches this audience: its grants list no people. Check the roles, teams or operations, or send to explicit userIds.')

/**
 * The user ids (as text) a message's audience stands for. The grants are checked first: an unknown kind or a reference
 * that does not exist is a 400, and so is `public` or `signed-in` (to reach everyone, send to lists). An audience
 * that lists nobody is 400 `audience_not_resolved`, so the sender finds out instead of believing it went out.
 */
export async function campaignsResolveUserAudience(event: H3Event, audience: CampaignAudience): Promise<string[]> {
  const userIds = (audience.userIds ?? []).map(String)
  if (audience.grants?.length) {
    const grants = await grantsValidate(event, audience.grants as Grant[], { field: 'audience' })
    if (grants.some(grant => grant.kind === 'public' || grant.kind === 'signed-in')) {
      throw validationError([{ path: ['audience', 'grants'], message: 'A message cannot go to everyone: name the roles, teams or people instead.' }])
    }
    userIds.push(...await grantsMembers(event, grants))
  }
  const ids = [...new Set(userIds)].filter(id => /^\d+$/.test(id))
  if (!ids.length) throw notResolved()
  return ids.sort((a, b) => Number(a) - Number(b))
}

/** The list channels of a campaign's channels (push never reaches a list). */
export const campaignsListChannels = (channels: readonly CampaignSendChannel[]): CampaignChannel[] =>
  channels.filter((channel): channel is CampaignChannel => channel === 'email' || channel === 'sms')

/**
 * The next contacts of the audience of a campaign to lists after `afterContactId` (in id order), with their active subscriptions on
 * the campaign's lists and channels. Paging by contact keeps every channel of a contact in the same page.
 */
export async function campaignsAudienceContactsPage(row: CampaignRow, afterContactId: string | null, limit: number) {
  const s = schema.campaignSubscriptions
  const listIds = row.audience.listIds ?? []
  const channels = campaignsListChannels(row.channels)
  if (!listIds.length || !channels.length) return []
  const conditions = [inArray(s.listId, listIds), inArray(s.channel, channels), eq(s.status, 'active')]
  if (afterContactId) conditions.push(gt(s.contactId, afterContactId))
  const contacts = await db.selectDistinct({ contactId: s.contactId }).from(s).where(and(...conditions))
    .orderBy(asc(s.contactId)).limit(limit)
  const contactIds = contacts.map(entry => entry.contactId)
  if (!contactIds.length) return []
  const subscriptions = await inChunks(contactIds, ids => db.select({ id: s.id, contactId: s.contactId, channel: s.channel })
    .from(s)
    .where(and(inArray(s.contactId, ids), inArray(s.listId, listIds), inArray(s.channel, channels), eq(s.status, 'active'))))
  return contactIds.map(contactId => ({
    contactId,
    subscriptions: subscriptions.filter(entry => entry.contactId === contactId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(entry => ({ id: entry.id, channel: entry.channel as CampaignChannel })),
  }))
}

/**
 * How many recipients each channel would reach now. A campaign to lists counts the contacts with an active subscription per
 * channel; a message counts the users of its audience on every channel it uses (their choices and addresses decide at
 * send time, so it is the most it can reach).
 */
export async function campaignsPreview(event: H3Event, row: CampaignRow): Promise<CampaignPreviewDto> {
  if (row.kind === 'people') {
    // Once scheduled, a message goes to the people resolved then, not whoever matches its groups now.
    const ids = row.status !== 'draft' && row.recipientUserIds ? row.recipientUserIds : await campaignsResolveUserAudience(event, row.audience)
    return { recipients: ids.length, channels: Object.fromEntries(row.channels.map(channel => [channel, ids.length])) }
  }
  const s = schema.campaignSubscriptions
  const listIds = row.audience.listIds ?? []
  const channels = campaignsListChannels(row.channels)
  if (!listIds.length || !channels.length) return { recipients: 0, channels: {} }
  const where = and(inArray(s.listId, listIds), inArray(s.channel, channels), eq(s.status, 'active'))
  const perChannel = await db.select({ channel: s.channel, total: countDistinct(s.contactId) }).from(s).where(where).groupBy(s.channel)
  const [all] = await db.select({ total: countDistinct(s.contactId) }).from(s).where(where)
  return {
    recipients: Number(all?.total ?? 0),
    channels: Object.fromEntries(channels.map(channel => [channel, Number(perChannel.find(entry => entry.channel === channel)?.total ?? 0)])),
  }
}

/** 400 `validation_failed` when a campaign names a list that does not exist. */
export async function campaignsCheckLists(listIds: readonly string[]): Promise<void> {
  if (!listIds.length) return
  const found = await inChunks([...new Set(listIds)], ids => db.select({ id: schema.campaignLists.id }).from(schema.campaignLists).where(inArray(schema.campaignLists.id, ids)))
  const known = new Set(found.map(entry => entry.id))
  const missing = listIds.filter(id => !known.has(id))
  if (missing.length) throw validationError(missing.map(id => ({ path: ['audience', 'listIds'], message: `Unknown list ${id}.` })))
}
