import { z } from 'zod'
import type {
  CampaignAudience,
  CampaignContent,
  CampaignCounts,
  CampaignDto,
  CampaignKind,
  CampaignSendChannel,
  CampaignStatus,
  Translated,
} from '../../../types'
import { campaignKindChannels, translatedTexts } from '../../utils/delivery'
import { CAMPAIGN_SEND_CHANNELS, campaignKindSchema } from '../../utils/schemas'

// The staff screens of campaigns, without Vue: what the viewer may do with a campaign, the form's state, schema and
// request body, and the numbers the pages show. Unit tested.

// --- Access ----------------------------------------------------------------------------------------------------------

/** What the viewer may do, from the permission list of `GET /api/auth/me/access` (display only: the API checks). */
export type CampaignPermissions = {
  /** `campaigns:manage`: see campaigns, write and delete drafts. */
  manage: boolean
  /** `campaigns:send`: send, schedule and cancel. */
  send: boolean
  /** `campaigns:send-important`: make a message important, and send or change an important one. */
  sendImportant: boolean
  /** `campaigns:pii`: see who each delivery went to. */
  pii: boolean
}

export function campaignPermissions(permissions: readonly string[]): CampaignPermissions {
  const has = (name: string) => permissions.includes(name)
  return {
    manage: has('campaigns:manage'),
    send: has('campaigns:send'),
    sendImportant: has('campaigns:send-important'),
    pii: has('campaigns:pii'),
  }
}

/** What can be done with a campaign now, by its status and the viewer's permissions (mirrors the routes). */
export type CampaignAvailableActions = {
  edit: boolean
  send: boolean
  schedule: boolean
  cancel: boolean
  duplicate: boolean
  remove: boolean
}

export function campaignAvailableActions(
  campaign: Pick<CampaignDto, 'status' | 'important'>,
  can: CampaignPermissions,
): CampaignAvailableActions {
  const draft = campaign.status === 'draft'
  // Changing, sending or copying an important message needs `campaigns:send-important` as well.
  const important = !campaign.important || can.sendImportant
  return {
    edit: draft && can.manage && important,
    send: draft && can.send && important,
    schedule: draft && can.send && important,
    cancel: (campaign.status === 'scheduled' || campaign.status === 'sending') && can.send,
    duplicate: can.manage && important,
    remove: draft && can.manage,
  }
}

// --- Statuses --------------------------------------------------------------------------------------------------------

export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'sending', 'sent', 'cancelled'] as const satisfies readonly CampaignStatus[]

/** Badge colours past `statusColor`'s defaults (`scheduled` is already amber, `draft` and `cancelled` neutral). */
export const CAMPAIGN_STATUS_COLORS = { sending: 'info', sent: 'success' } as const

/** Grant kinds a message cannot go to: everyone is the audience of a campaign to lists. */
export const CAMPAIGN_EXCLUDED_GRANT_KINDS = ['public', 'signed-in'] as const

// --- Numbers ---------------------------------------------------------------------------------------------------------

export type CampaignTotals = { total: number, queued: number, sent: number, skipped: number, failed: number, opened: number, clicked: number, clicks: number }

/** The counts of every channel added up; `null` when there are none yet. */
export function campaignTotals(counts: CampaignCounts | null | undefined): CampaignTotals | null {
  const entries = Object.values(counts ?? {}).filter(Boolean)
  if (!entries.length) return null
  const totals: CampaignTotals = { total: 0, queued: 0, sent: 0, skipped: 0, failed: 0, opened: 0, clicked: 0, clicks: 0 }
  for (const entry of entries) {
    for (const key of Object.keys(totals) as Array<keyof CampaignTotals>) totals[key] += entry[key] ?? 0
  }
  return totals
}

/** The locales a campaign's texts are written in (a text for every language counts as none), sorted. */
export function campaignContentLocales(content: CampaignContent): string[] {
  const values: Array<Translated | null | undefined> = [
    content.email?.subject,
    content.email?.body,
    content.sms?.body,
    content.push?.title,
    content.push?.body,
  ]
  const locales = new Set<string>()
  for (const value of values) {
    if (value && typeof value === 'object') {
      for (const [locale, text] of Object.entries(value)) if (text.trim()) locales.add(locale)
    }
  }
  return [...locales].sort()
}

// --- Dates -----------------------------------------------------------------------------------------------------------

/** A `datetime-local` input's value for an instant: the local time without a zone. */
export function toLocalDateTimeInput(value: Date | string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

/** The instant of a `datetime-local` value (read in the browser's zone), or `null` for an empty or invalid one. */
export function fromLocalDateTimeInput(value: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// --- Form ------------------------------------------------------------------------------------------------------------

export type CampaignFormState = {
  kind: CampaignKind
  name: string
  channels: CampaignSendChannel[]
  /** The lists of a campaign to lists. */
  listIds: string[]
  /** A message's people (user ids). */
  userIds: number[]
  /** A message's groups. */
  grants: NonNullable<CampaignAudience['grants']>
  emailSubject: Translated | undefined
  emailBody: Translated | undefined
  smsBody: Translated | undefined
  pushTitle: Translated | undefined
  pushBody: Translated | undefined
  pushUrl: string
  trackClicks: boolean
  trackOpens: boolean
  important: boolean
}

const hasText = (value: Translated | null | undefined) => translatedTexts(value).some(text => !!text.trim())

/** A translated value with its empty texts dropped; `undefined` when none is left. */
function cleanTranslated(value: Translated | null | undefined): Translated | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value.trim() ? value : undefined
  const entries = Object.entries(value).filter(([, text]) => text.trim())
  return entries.length ? Object.fromEntries(entries) : undefined
}

export const emptyCampaignForm = (kind: CampaignKind = 'lists', listIds: string[] = []): CampaignFormState => ({
  kind,
  name: '',
  channels: ['email'],
  listIds: [...listIds],
  userIds: [],
  grants: [],
  emailSubject: undefined,
  emailBody: undefined,
  smsBody: undefined,
  pushTitle: undefined,
  pushBody: undefined,
  pushUrl: '',
  trackClicks: true,
  trackOpens: false,
  important: false,
})

export const campaignToForm = (campaign: CampaignDto): CampaignFormState => ({
  kind: campaign.kind,
  name: campaign.name,
  channels: [...campaign.channels],
  listIds: [...(campaign.audience.listIds ?? [])],
  userIds: (campaign.audience.userIds ?? []).map(Number).filter(Number.isSafeInteger),
  grants: structuredClone(campaign.audience.grants ?? []),
  emailSubject: campaign.content.email?.subject,
  emailBody: campaign.content.email?.body,
  smsBody: campaign.content.sms?.body,
  pushTitle: campaign.content.push?.title,
  pushBody: campaign.content.push?.body,
  pushUrl: campaign.content.push?.url ?? '',
  trackClicks: campaign.trackClicks,
  trackOpens: campaign.trackOpens,
  important: campaign.important,
})

/**
 * The fields of a create (`POST`, with `kind`) or edit (`PATCH`) body. Only the picked channels keep their texts, a
 * channel without any text is left out (a draft may be unfinished: sending checks it), the audience fits the kind and
 * `important` is only ever set on a message.
 */
export function campaignFormBody(state: CampaignFormState) {
  const allowed = campaignKindChannels(state.kind)
  const channels = state.channels.filter(channel => allowed.includes(channel))
  const content: CampaignContent = {}
  const subject = cleanTranslated(state.emailSubject)
  const body = cleanTranslated(state.emailBody)
  if (channels.includes('email') && subject && body) content.email = { subject, body }
  const sms = cleanTranslated(state.smsBody)
  if (channels.includes('sms') && sms) content.sms = { body: sms }
  const pushTitle = cleanTranslated(state.pushTitle)
  const pushBody = cleanTranslated(state.pushBody)
  if (channels.includes('push') && pushTitle && pushBody) content.push = { title: pushTitle, body: pushBody, url: state.pushUrl.trim() || null }
  const audience: CampaignAudience = state.kind === 'lists'
    ? { listIds: [...state.listIds] }
    : { userIds: state.userIds.map(String), grants: state.grants }
  return {
    name: state.name.trim(),
    channels,
    audience,
    content,
    trackClicks: state.trackClicks,
    trackOpens: channels.includes('email') && state.trackOpens,
    important: state.kind === 'people' && state.important,
  }
}

/** The body that creates a copy of `campaign` as a new draft named `name`. */
export function campaignDuplicateBody(campaign: CampaignDto, name: string) {
  return {
    kind: campaign.kind,
    name,
    channels: [...campaign.channels],
    audience: structuredClone(campaign.audience),
    content: structuredClone(campaign.content),
    locale: campaign.locale,
    trackClicks: campaign.trackClicks,
    trackOpens: campaign.trackOpens,
    important: campaign.important,
  }
}

type T = (key: string, fallback: string) => string

const translatedField = z.custom<Translated | undefined>()

/**
 * The form's schema, with messages in the staff member's language. A draft may be unfinished, but a channel's texts go
 * together: once one of them is written the others are needed (the API takes an email with both subject and text).
 */
export function campaignFormSchema(t: T) {
  return z.object({
    kind: campaignKindSchema,
    name: z.string().trim().min(1, t('campaign.form.nameRequired', 'Give the campaign a name.')).max(200),
    channels: z.array(z.enum(CAMPAIGN_SEND_CHANNELS)).min(1, t('campaign.form.channelsRequired', 'Pick at least one channel.')),
    listIds: z.array(z.string()),
    userIds: z.array(z.number()),
    grants: z.array(z.looseObject({ kind: z.string() })),
    emailSubject: translatedField,
    emailBody: translatedField,
    smsBody: translatedField,
    pushTitle: translatedField,
    pushBody: translatedField,
    pushUrl: z.string().trim().max(2000).refine(value => !value || /^https?:\/\/\S+$/i.test(value) || (value.startsWith('/') && !value.startsWith('//')), t('campaign.form.pushUrlInvalid', 'Use an http(s) URL or a path on this site.')),
    trackClicks: z.boolean(),
    trackOpens: z.boolean(),
    important: z.boolean(),
  }).superRefine((state, ctx) => {
    const allowed = campaignKindChannels(state.kind)
    if (state.channels.some(channel => !allowed.includes(channel))) {
      ctx.addIssue({ code: 'custom', path: ['channels'], message: t('campaign.form.channelsKind', 'A campaign to lists goes out by email and SMS only.') })
    }
    const pairs: Array<[CampaignSendChannel, Array<[keyof CampaignFormState, string]>]> = [
      ['email', [['emailSubject', t('campaign.form.emailSubjectRequired', 'Write the subject of the email.')], ['emailBody', t('campaign.form.emailBodyRequired', 'Write the text of the email.')]]],
      ['push', [['pushTitle', t('campaign.form.pushTitleRequired', 'Write the title of the notification.')], ['pushBody', t('campaign.form.pushBodyRequired', 'Write the text of the notification.')]]],
    ]
    for (const [channel, fields] of pairs) {
      if (!state.channels.includes(channel)) continue
      const written = fields.some(([field]) => hasText(state[field] as Translated | undefined))
      if (!written) continue
      for (const [field, message] of fields) {
        if (!hasText(state[field] as Translated | undefined)) ctx.addIssue({ code: 'custom', path: [field], message })
      }
    }
  })
}
