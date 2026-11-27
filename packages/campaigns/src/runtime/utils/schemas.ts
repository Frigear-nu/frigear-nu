import { z } from 'zod'
import type { CampaignChannel, CampaignListSignupMode, CampaignSendChannel } from '../../types'

// Request schemas shared by the routes and the admin forms. Plain zod, no server imports, so the app can use them.

export const CAMPAIGN_CHANNELS = ['email', 'sms'] as const satisfies readonly CampaignChannel[]

/** A list's URL name: lowercase letters, digits and single dashes. */
export const CAMPAIGN_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const campaignChannelSchema = z.enum(CAMPAIGN_CHANNELS)

export const campaignSlugSchema = z.string().trim().min(1).max(64).regex(CAMPAIGN_SLUG, 'Use lowercase letters, digits and dashes.')

/** A text in one language, or a locale -> text map with at least one text. */
export const campaignTranslatedInput = (max = 200) => z.union([
  z.string().trim().min(1).max(max),
  z.record(z.string().min(2).max(16), z.string().trim().max(max))
    .refine(value => Object.values(value).some(Boolean), 'Write the text in at least one language.'),
])

/** An email address, trimmed and lower-cased (contacts are unique by it). */
export function normalizeCampaignEmail(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * A phone number in E.164 (`+4512345678`): spaces, dashes, dots and brackets dropped, a leading `00` read as `+`.
 * `null` when it is not a full international number.
 */
export function normalizeCampaignPhone(value: string): string | null {
  const compact = value.trim().replace(/[\s\-.()]/g, '').replace(/^00/, '+')
  return /^\+[1-9]\d{6,14}$/.test(compact) ? compact : null
}

/** `on`, `true`, `1` and `yes` (a checked checkbox of a plain HTML form, or JSON `true`). */
const isChecked = (value: unknown) => value === true || (typeof value === 'string' && ['on', 'true', '1', 'yes'].includes(value.trim().toLowerCase()))

/** A form field that may be absent or empty: empty means absent. */
const optionalText = (max: number) => z.preprocess(
  value => typeof value === 'string' && !value.trim() ? undefined : value,
  z.string().trim().max(max).optional(),
)

/**
 * `POST /api/campaigns/lists/:slug/subscribe`, as JSON or as a plain HTML form (`application/x-www-form-urlencoded`):
 * an email address and/or a phone number, the consent checkbox, and optionally a name, the locale messages use and the
 * channels (all the list offers that the person gave an address for, when left out). The captcha response comes as
 * `captcha`, or under the name the provider's widget gives it in a plain form. `website` is a honeypot: people never
 * fill it in.
 */
export const campaignSubscribeInput = z.object({
  'email': z.preprocess(
    value => typeof value === 'string' ? (value.trim() ? normalizeCampaignEmail(value) : undefined) : value,
    z.email().max(254).optional(),
  ),
  'phone': z.preprocess(
    value => typeof value === 'string' ? (value.trim() ? (normalizeCampaignPhone(value) ?? value) : undefined) : value,
    z.string().regex(/^\+[1-9]\d{6,14}$/, 'Write the phone number with its country code, such as +4512345678.').optional(),
  ),
  'name': optionalText(120),
  'locale': z.preprocess(
    value => typeof value === 'string' && !value.trim() ? undefined : value,
    z.string().trim().max(35).regex(/^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i).optional(),
  ),
  'channels': z.preprocess(
    value => typeof value === 'string' ? [value] : value,
    z.array(campaignChannelSchema).min(1).max(2).optional(),
  ),
  'consent': z.preprocess(isChecked, z.literal(true, { error: 'Tick the consent box to sign up.' })),
  'captcha': optionalText(4096),
  'cf-turnstile-response': optionalText(4096),
  'g-recaptcha-response': optionalText(4096),
  'h-captcha-response': optionalText(4096),
  'website': z.string().max(500).optional(),
}).refine(value => value.email || value.phone, { message: 'Give an email address or a phone number.', path: ['email'] })

export type CampaignSubscribeInput = z.output<typeof campaignSubscribeInput>

const formFieldsShape = z.object({
  email: z.string().trim().min(1).max(64).optional(),
  phone: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(64).optional(),
  consent: z.string().trim().min(1).max(64).optional(),
}).strict()

/** `off`, `offer` (an unticked box on the registration form) or `auto` (every new account is added). */
export const CAMPAIGN_LIST_SIGNUP_MODES = ['off', 'offer', 'auto'] as const satisfies readonly CampaignListSignupMode[]

export const campaignListSignupModeSchema = z.enum(CAMPAIGN_LIST_SIGNUP_MODES)

const channelList = z.array(campaignChannelSchema).min(1).max(2)
  .refine(value => new Set(value).size === value.length, 'Pick each channel once.')

/** `POST /api/admin/campaigns/lists`. */
export const campaignListCreateInput = z.object({
  slug: campaignSlugSchema,
  name: campaignTranslatedInput(),
  description: campaignTranslatedInput(1000).nullish(),
  channels: channelList.default(['email']),
  doubleOptIn: z.boolean().default(true),
  public: z.boolean().default(true),
  signupMode: campaignListSignupModeSchema.default('off'),
  consentText: campaignTranslatedInput(2000).nullish(),
  formId: z.string().trim().min(1).max(128).nullish(),
  formFields: formFieldsShape.nullish(),
})

/** `PATCH /api/admin/campaigns/lists/:id`: any of the create fields. A changed consent text bumps `consentVersion`. */
export const campaignListPatchInput = z.object({
  slug: campaignSlugSchema.optional(),
  name: campaignTranslatedInput().optional(),
  description: campaignTranslatedInput(1000).nullable().optional(),
  channels: channelList.optional(),
  doubleOptIn: z.boolean().optional(),
  public: z.boolean().optional(),
  signupMode: campaignListSignupModeSchema.optional(),
  consentText: campaignTranslatedInput(2000).nullable().optional(),
  formId: z.string().trim().min(1).max(128).nullable().optional(),
  formFields: formFieldsShape.nullable().optional(),
})

/** `PATCH /api/campaigns/me/subscriptions`: per list id, the channels to turn on (`true`) or off (`false`). */
export const campaignMySubscriptionsPatch = z.object({
  lists: z.record(
    z.string().trim().min(1).max(64),
    z.object({ email: z.boolean(), sms: z.boolean() }).partial().strict(),
  ).refine(value => Object.keys(value).length <= 100, 'Change at most 100 lists at once.'),
})

/** `extras.campaigns` of a registration (`auth:user:created`): the ids of the offered lists the person ticked. */
export const campaignRegisterExtras = z.object({
  listIds: z.array(z.string().trim().min(1).max(64)).max(50).default([]),
})

/** `slug` router param. */
export const campaignSlugParams = z.object({ slug: campaignSlugSchema })

/** `token` router param: a confirmation or unsubscribe token. */
export const campaignTokenParams = z.object({ token: z.string().trim().min(1).max(256) })

// --- Campaigns -------------------------------------------------------------------------------------------------------

export const CAMPAIGN_SEND_CHANNELS = ['email', 'sms', 'push'] as const satisfies readonly CampaignSendChannel[]

export const campaignKindSchema = z.enum(['newsletter', 'message'])

const sendChannelList = z.array(z.enum(CAMPAIGN_SEND_CHANNELS)).min(1).max(3)
  .refine(value => new Set(value).size === value.length, 'Pick each channel once.')

/** A grant of an audience: its kind is checked against the registered kinds when the campaign is sent. */
const audienceGrant = z.looseObject({ kind: z.string().trim().min(1).max(64) })

export const campaignAudienceInput = z.strictObject({
  listIds: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  grants: z.array(audienceGrant).max(50).optional(),
  userIds: z.array(z.union([z.string(), z.number()]).transform(String).pipe(z.string().trim().min(1).max(64))).max(5000).optional(),
})

const optionalUrl = z.string().trim().max(2000).refine((value) => {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  }
  catch {
    return value.startsWith('/') && !value.startsWith('//')
  }
}, 'Use an http(s) URL or a path on this site.')

export const campaignContentInput = z.strictObject({
  email: z.strictObject({ subject: campaignTranslatedInput(200), body: campaignTranslatedInput(50_000) }).optional(),
  sms: z.strictObject({ body: campaignTranslatedInput(1000) }).optional(),
  push: z.strictObject({ title: campaignTranslatedInput(100), body: campaignTranslatedInput(300), url: optionalUrl.nullish() }).optional(),
})

const localeInput = z.string().trim().max(35).regex(/^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/i)

/** `POST /api/admin/campaigns`: a draft. Whether it can be sent is checked on send (`campaignSendIssues`). */
export const campaignCreateInput = z.object({
  kind: campaignKindSchema,
  name: z.string().trim().min(1).max(200),
  channels: sendChannelList.default(['email']),
  audience: campaignAudienceInput.default({}),
  content: campaignContentInput.default({}),
  locale: localeInput.nullish(),
  trackClicks: z.boolean().default(true),
  trackOpens: z.boolean().default(false),
  important: z.boolean().default(false),
})

/** `PATCH /api/admin/campaigns/:id`: any of the create fields but `kind`, on a draft only. */
export const campaignPatchInput = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  channels: sendChannelList.optional(),
  audience: campaignAudienceInput.optional(),
  content: campaignContentInput.optional(),
  locale: localeInput.nullable().optional(),
  trackClicks: z.boolean().optional(),
  trackOpens: z.boolean().optional(),
  important: z.boolean().optional(),
})

/** `POST /api/admin/campaigns/:id/schedule`: when to send, in the future. */
export const campaignScheduleInput = z.object({
  scheduledAt: z.coerce.date().refine(value => value.getTime() > Date.now(), 'Pick a time in the future.'),
})
