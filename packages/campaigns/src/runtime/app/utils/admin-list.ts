import { z } from 'zod'
import type { CampaignChannel, CampaignListDto, Translated } from '../../../types'
import { CAMPAIGN_SLUG, CAMPAIGN_CHANNELS } from '../../utils/schemas'

// The staff form of a newsletter list: its state, the schema `UForm` checks it with, and the request body.

export type CampaignListFormState = {
  name: Translated | undefined
  slug: string
  description: Translated | undefined
  channels: CampaignChannel[]
  doubleOptIn: boolean
  public: boolean
  consentText: Translated | undefined
}

const hasText = (value: Translated | null | undefined) => !!value && (typeof value === 'string' ? !!value.trim() : Object.values(value).some(text => text.trim()))

type T = (key: string, fallback: string) => string

/** The form's schema, with messages in the staff member's language. */
export function campaignListFormSchema(t: T) {
  return z.object({
    name: z.custom<Translated | undefined>(value => hasText(value as Translated | undefined), t('admin.form.nameRequired', 'Give the newsletter a name.')),
    slug: z.string().trim().min(1, t('admin.form.slugRequired', 'Give the newsletter a URL name.')).max(64).regex(CAMPAIGN_SLUG, t('admin.form.slugInvalid', 'Use lowercase letters, digits and dashes.')),
    description: z.custom<Translated | undefined>(),
    channels: z.array(z.enum(CAMPAIGN_CHANNELS)).min(1, t('admin.form.channelsRequired', 'Pick at least one channel.')),
    doubleOptIn: z.boolean(),
    public: z.boolean(),
    consentText: z.custom<Translated | undefined>(),
  })
}

export const emptyCampaignListForm = (): CampaignListFormState => ({
  name: undefined,
  slug: '',
  description: undefined,
  channels: ['email'],
  doubleOptIn: true,
  public: true,
  consentText: undefined,
})

export const campaignListToForm = (list: CampaignListDto): CampaignListFormState => ({
  name: list.name,
  slug: list.slug,
  description: list.description ?? undefined,
  channels: [...list.channels],
  doubleOptIn: list.doubleOptIn,
  public: list.public,
  consentText: list.consentText ?? undefined,
})

/** The request body of a create (POST) or edit (PATCH): empty texts are `null`. */
export const campaignListFormBody = (state: CampaignListFormState) => ({
  name: state.name,
  slug: state.slug.trim(),
  description: hasText(state.description) ? state.description : null,
  channels: state.channels,
  doubleOptIn: state.doubleOptIn,
  public: state.public,
  consentText: hasText(state.consentText) ? state.consentText : null,
})

/** A URL name from a name: lowercase ASCII letters and digits joined by dashes. */
export function campaignSlugify(value: string): string {
  return value.toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
}
