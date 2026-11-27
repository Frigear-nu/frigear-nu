import type { schema } from '@nuxthub/db'
import { isoDate } from '@frigear-nu/module-kit/server'
import type {
  CampaignChannel,
  CampaignListCounts,
  CampaignListDto,
  CampaignListPublicDto,
  CampaignSubscriberDto,
  CampaignSubscriptionResultDto,
  CampaignSubscriptionSource,
} from '../../../types'

export type CampaignListRow = typeof schema.campaignLists.$inferSelect
export type CampaignContactRow = typeof schema.campaignContacts.$inferSelect
export type CampaignSubscriptionRow = typeof schema.campaignSubscriptions.$inferSelect

/** Zero counts for every channel. */
export const campaignsEmptyCounts = (): CampaignListCounts => ({
  email: { active: 0, pending: 0, unsubscribed: 0 },
  sms: { active: 0, pending: 0, unsubscribed: 0 },
})

/** A list as the public signup sees it: no form mapping, no counts. */
export function toCampaignListPublicDto(row: CampaignListRow): CampaignListPublicDto {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    channels: row.channels,
    doubleOptIn: row.doubleOptIn,
    consentText: row.consentText ?? null,
    consentVersion: row.consentVersion,
  }
}

/** A list as staff see it. */
export function toCampaignListDto(row: CampaignListRow, counts: CampaignListCounts = campaignsEmptyCounts()): CampaignListDto {
  return {
    ...toCampaignListPublicDto(row),
    id: row.id,
    public: row.public,
    formId: row.formId ?? null,
    formFields: row.formFields ?? null,
    counts,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }
}

/** One row of the subscribers table; the address only for callers with `campaigns:pii`. */
export function toCampaignSubscriberDto(row: CampaignSubscriptionRow, contact: CampaignContactRow, pii: boolean): CampaignSubscriberDto {
  return {
    id: row.id,
    channel: row.channel as CampaignChannel,
    status: row.status,
    source: row.source as CampaignSubscriptionSource,
    consentVersion: row.consentVersion ?? null,
    requestedAt: isoDate(row.requestedAt),
    confirmedAt: isoDate(row.confirmedAt),
    unsubscribedAt: isoDate(row.unsubscribedAt),
    contact: {
      id: contact.id,
      name: contact.name ?? null,
      locale: contact.locale ?? null,
      userId: contact.userId ?? null,
      ...(pii ? { email: contact.email ?? null, phone: contact.phone ?? null } : {}),
    },
  }
}

/** What the confirm and unsubscribe routes answer. */
export function toCampaignSubscriptionResultDto(row: CampaignSubscriptionRow, list: CampaignListRow): CampaignSubscriptionResultDto {
  return { list: { slug: list.slug, name: list.name }, channel: row.channel as CampaignChannel, status: row.status }
}
