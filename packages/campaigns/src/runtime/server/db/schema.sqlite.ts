import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

// Texts that can be shown in several languages are stored as json: either a plain string, or a
// `{ da: '...', en: '...' }` map (see `Translated` in types.ts).
// (declared here, not imported: this file is merged into the generated schema as plain text)
type Translated = string | Record<string, string>
type CampaignChannel = 'email' | 'sms'
type CampaignFormFields = { email?: string, phone?: string, name?: string, consent?: string }
type CampaignSendChannel = 'email' | 'sms' | 'push'
type CampaignAudience = { listIds?: string[], grants?: Array<{ kind: string } & Record<string, unknown>>, userIds?: string[] }
type CampaignContent = {
  email?: { subject: Translated, body: Translated }
  sms?: { body: Translated }
  push?: { title: Translated, body: Translated, url?: string | null }
}
type CampaignChannelCounts = { total: number, queued: number, sent: number, skipped: number, failed: number, opened: number, clicked: number, clicks: number }

/** A newsletter people sign up to. */
export const campaignLists = sqliteTable('campaign_lists', {
  /** `cml_` + random id. */
  id: text().primaryKey(),
  /** The list in URLs and the signup component (`<NewsletterSignup list="slug">`). */
  slug: text().notNull(),
  name: text({ mode: 'json' }).$type<Translated>().notNull(),
  description: text({ mode: 'json' }).$type<Translated>(),
  /** The channels people can sign up on. */
  channels: text({ mode: 'json' }).$type<CampaignChannel[]>().notNull(),
  /** A new subscription stays `pending` until the person follows the link in the confirmation message. */
  doubleOptIn: integer({ mode: 'boolean' }).notNull().default(true),
  /** Anyone can sign up through the public route, and signed-in users see it on their account page. */
  public: integer({ mode: 'boolean' }).notNull().default(true),
  /** The consent the signup shows next to its checkbox. */
  consentText: text({ mode: 'json' }).$type<Translated>(),
  /** Goes up by one whenever `consentText` changes; a subscription stores the version the person agreed to. */
  consentVersion: integer().notNull().default(1),
  /** A forms form whose submissions sign people up (`forms.id`), and which of its fields hold what. */
  formId: text(),
  formFields: text({ mode: 'json' }).$type<CampaignFormFields>(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  uniqueIndex('campaign_list_slug_unique').on(t.slug),
])

/** A person who can be reached: an email address, a phone number or both, linked to a user once they sign in. */
export const campaignContacts = sqliteTable('campaign_contacts', {
  /** `cmc_` + random id. */
  id: text().primaryKey(),
  /** Lower-cased. */
  email: text(),
  /** E.164 (`+4512345678`). */
  phone: text(),
  /** The user with this verified email address (`users.id`), set when they are signed in. */
  userId: integer(),
  name: text(),
  /** The language messages to this contact use. */
  locale: text(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  uniqueIndex('campaign_contact_email_unique').on(t.email),
  uniqueIndex('campaign_contact_phone_unique').on(t.phone),
  index('campaign_contact_user_idx').on(t.userId),
])

/** A contact on a list, on one channel, with the proof of their consent. */
export const campaignSubscriptions = sqliteTable('campaign_subscriptions', {
  /** `cms_` + random id. */
  id: text().primaryKey(),
  listId: text().notNull().references(() => campaignLists.id, { onDelete: 'cascade' }),
  contactId: text().notNull().references(() => campaignContacts.id, { onDelete: 'cascade' }),
  channel: text().$type<CampaignChannel>().notNull(),
  /** `pending` until confirmed, `active`, or `unsubscribed`. */
  status: text().$type<'pending' | 'active' | 'unsubscribed'>().notNull().default('pending'),
  /** SHA-256 (hex) of the confirmation token, cleared once confirmed. The token itself is only in the message. */
  confirmTokenHash: text(),
  confirmExpiresAt: integer({ mode: 'timestamp' }),
  /** Where the consent came from: `form` (the signup), `api`, `admin`, `forms` (a forms submission) or `account`. */
  source: text().notNull(),
  /** The list's `consentVersion` the person agreed to. */
  consentVersion: integer(),
  /** When the person asked to be signed up (the last time, for a renewed request). */
  requestedAt: integer({ mode: 'timestamp' }).notNull(),
  /** When the person confirmed (or, without double opt-in, when they signed up). */
  confirmedAt: integer({ mode: 'timestamp' }),
  /** Keyed hash (HMAC-SHA-256) of the IP address the request came from; never the address itself. */
  ipHash: text(),
  unsubscribedAt: integer({ mode: 'timestamp' }),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  uniqueIndex('campaign_subscription_unique').on(t.listId, t.contactId, t.channel),
  uniqueIndex('campaign_subscription_confirm_unique').on(t.confirmTokenHash),
  index('campaign_subscription_list_status_idx').on(t.listId, t.status),
  index('campaign_subscription_contact_idx').on(t.contactId),
])

/**
 * A campaign: a newsletter issue to the subscribers of lists (`kind: 'newsletter'`, email and SMS), or a message to
 * users (`kind: 'message'`, email, SMS and push, following their `campaigns.message` choices unless `important`).
 */
export const campaigns = sqliteTable('campaigns', {
  /** `cmp_` + random id. */
  id: text().primaryKey(),
  /** `newsletter` (to list subscribers) or `message` (to users). */
  kind: text().$type<'newsletter' | 'message'>().notNull(),
  /** Staff-facing name; never sent. */
  name: text().notNull(),
  channels: text({ mode: 'json' }).$type<CampaignSendChannel[]>().notNull(),
  /** `listIds` for a newsletter; `grants` and/or `userIds` for a message. */
  audience: text({ mode: 'json' }).$type<CampaignAudience>().notNull(),
  /** The text per channel; markdown for the email body. */
  content: text({ mode: 'json' }).$type<CampaignContent>().notNull(),
  /** The language for recipients without one; English when unset. */
  locale: text(),
  /** Links in the content become short links that count clicks per recipient. */
  trackClicks: integer({ mode: 'boolean' }).notNull().default(true),
  /** A 1x1 image in the email marks it opened. */
  trackOpens: integer({ mode: 'boolean' }).notNull().default(false),
  /** A message that reaches users on every channel asked for, whatever they chose for `campaigns.message`. */
  important: integer({ mode: 'boolean' }).notNull().default(false),
  /** `draft`, `scheduled`, `sending`, `sent` or `cancelled`. */
  status: text().$type<'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled'>().notNull().default('draft'),
  scheduledAt: integer({ mode: 'timestamp' }),
  startedAt: integer({ mode: 'timestamp' }),
  /** Set once every delivery row exists; until then the deliver task keeps adding them from `materializeCursor`. */
  materializedAt: integer({ mode: 'timestamp' }),
  /** Where materializing stopped: the last contact id (newsletter) or the number of users done (message). */
  materializeCursor: text(),
  finishedAt: integer({ mode: 'timestamp' }),
  cancelledAt: integer({ mode: 'timestamp' }),
  /** The users of a message's audience, resolved when it was sent or scheduled (grant kinds need the request). */
  recipientUserIds: text({ mode: 'json' }).$type<string[]>(),
  /** The site the links in the messages point at, taken from the request that sent or scheduled it. */
  origin: text(),
  createdBy: integer(),
  sentBy: integer(),
  /** Counts per channel, kept once the delivery rows are pruned. */
  counts: text({ mode: 'json' }).$type<Partial<Record<CampaignSendChannel, CampaignChannelCounts>>>(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('campaign_status_idx').on(t.status, t.scheduledAt),
  index('campaign_created_idx').on(t.createdAt),
])

/** A link of a campaign's content: one short link (owner `campaigns` + campaign id) per distinct URL. */
export const campaignLinks = sqliteTable('campaign_links', {
  /** `cmk_` + random id. */
  id: text().primaryKey(),
  campaignId: text().notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  /** `short_links.id` (no foreign key: that table belongs to `@frigear-nu/short-links`). */
  shortLinkId: text().notNull(),
  /** The target as written in the content. */
  url: text().notNull(),
  /** Order of first appearance in the content. */
  position: integer().notNull(),
}, t => [
  uniqueIndex('campaign_link_unique').on(t.campaignId, t.url),
  uniqueIndex('campaign_link_short_unique').on(t.shortLinkId),
])

/**
 * One message of a campaign to one recipient on one channel. No address is copied here: it is read at send time from the
 * contact (newsletter) or notify's recipient store (message).
 */
export const campaignDeliveries = sqliteTable('campaign_deliveries', {
  /** `cmd_` + random id; signed, it is the token in the message's links. */
  id: text().primaryKey(),
  campaignId: text().notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  channel: text().$type<CampaignSendChannel>().notNull(),
  /** A message's recipient (`users.id`). */
  userId: integer(),
  /** A newsletter's recipient. */
  contactId: text(),
  /** The subscription it went out for (the first one, when the contact is on several of the campaign's lists). */
  subscriptionId: text(),
  /** `queued`, `sending` (claimed), `sent`, `skipped` or `failed`. */
  status: text().$type<'queued' | 'sending' | 'sent' | 'skipped' | 'failed'>().notNull().default('queued'),
  /** Why it was skipped: `disabled` (the user's choice), `unavailable`, `unsubscribed`, `cancelled`, ... */
  skipReason: text(),
  attempts: integer().notNull().default(0),
  /** Random id of the deliver pass that claimed it. */
  claimId: text(),
  claimedAt: integer({ mode: 'timestamp' }),
  sentAt: integer({ mode: 'timestamp' }),
  openedAt: integer({ mode: 'timestamp' }),
  clickedAt: integer({ mode: 'timestamp' }),
  clicks: integer().notNull().default(0),
  error: text(),
}, t => [
  index('campaign_delivery_status_idx').on(t.campaignId, t.status),
  index('campaign_delivery_claim_idx').on(t.status, t.claimedAt),
  uniqueIndex('campaign_delivery_user_unique').on(t.campaignId, t.channel, t.userId),
  uniqueIndex('campaign_delivery_contact_unique').on(t.campaignId, t.channel, t.contactId),
])

/** One counted click of a campaign link by a delivery's recipient, for per-link stats. */
export const campaignClicks = sqliteTable('campaign_clicks', {
  id: integer().primaryKey({ autoIncrement: true }),
  deliveryId: text().notNull().references(() => campaignDeliveries.id, { onDelete: 'cascade' }),
  linkId: text().notNull().references(() => campaignLinks.id, { onDelete: 'cascade' }),
  at: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, t => [
  index('campaign_click_delivery_idx').on(t.deliveryId),
  index('campaign_click_link_idx').on(t.linkId),
])
