import { pgTable, text, integer, boolean, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'

// Texts that can be shown in several languages are stored as json: either a plain string, or a
// `{ da: '...', en: '...' }` map (see `Translated` in types.ts).
// (declared here, not imported: this file is merged into the generated schema as plain text)
type Translated = string | Record<string, string>
type CampaignChannel = 'email' | 'sms'
type CampaignFormFields = { email?: string, phone?: string, name?: string, consent?: string }

/** A newsletter people sign up to. */
export const campaignLists = pgTable('campaign_lists', {
  /** `cml_` + random id. */
  id: text().primaryKey(),
  /** The list in URLs and the signup component (`<NewsletterSignup list="slug">`). */
  slug: text().notNull(),
  name: jsonb().$type<Translated>().notNull(),
  description: jsonb().$type<Translated>(),
  /** The channels people can sign up on. */
  channels: jsonb().$type<CampaignChannel[]>().notNull(),
  /** A new subscription stays `pending` until the person follows the link in the confirmation message. */
  doubleOptIn: boolean().notNull().default(true),
  /** Anyone can sign up through the public route, and signed-in users see it on their account page. */
  public: boolean().notNull().default(true),
  /** The consent the signup shows next to its checkbox. */
  consentText: jsonb().$type<Translated>(),
  /** Goes up by one whenever `consentText` changes; a subscription stores the version the person agreed to. */
  consentVersion: integer().notNull().default(1),
  /** A forms form whose submissions sign people up (`forms.id`), and which of its fields hold what. */
  formId: text(),
  formFields: jsonb().$type<CampaignFormFields>(),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  uniqueIndex('campaign_list_slug_unique').on(t.slug),
])

/** A person who can be reached: an email address, a phone number or both, linked to a user once they sign in. */
export const campaignContacts = pgTable('campaign_contacts', {
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
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  uniqueIndex('campaign_contact_email_unique').on(t.email),
  uniqueIndex('campaign_contact_phone_unique').on(t.phone),
  index('campaign_contact_user_idx').on(t.userId),
])

/** A contact on a list, on one channel, with the proof of their consent. */
export const campaignSubscriptions = pgTable('campaign_subscriptions', {
  /** `cms_` + random id. */
  id: text().primaryKey(),
  listId: text().notNull().references(() => campaignLists.id, { onDelete: 'cascade' }),
  contactId: text().notNull().references(() => campaignContacts.id, { onDelete: 'cascade' }),
  channel: text().$type<CampaignChannel>().notNull(),
  /** `pending` until confirmed, `active`, or `unsubscribed`. */
  status: text().$type<'pending' | 'active' | 'unsubscribed'>().notNull().default('pending'),
  /** SHA-256 (hex) of the confirmation token, cleared once confirmed. The token itself is only in the message. */
  confirmTokenHash: text(),
  confirmExpiresAt: timestamp({ withTimezone: true }),
  /** Where the consent came from: `form` (the signup), `api`, `admin`, `forms` (a forms submission) or `account`. */
  source: text().notNull(),
  /** The list's `consentVersion` the person agreed to. */
  consentVersion: integer(),
  /** When the person asked to be signed up (the last time, for a renewed request). */
  requestedAt: timestamp({ withTimezone: true }).notNull(),
  /** When the person confirmed (or, without double opt-in, when they signed up). */
  confirmedAt: timestamp({ withTimezone: true }),
  /** Keyed hash (HMAC-SHA-256) of the IP address the request came from; never the address itself. */
  ipHash: text(),
  unsubscribedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  uniqueIndex('campaign_subscription_unique').on(t.listId, t.contactId, t.channel),
  uniqueIndex('campaign_subscription_confirm_unique').on(t.confirmTokenHash),
  index('campaign_subscription_list_status_idx').on(t.listId, t.status),
  index('campaign_subscription_contact_idx').on(t.contactId),
])
