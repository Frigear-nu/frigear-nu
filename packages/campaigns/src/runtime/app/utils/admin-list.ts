import { z } from 'zod'
import type { CampaignChannel, CampaignFormFields, CampaignListDto, CampaignListSignupMode, Translated } from '../../../types'
import { CAMPAIGN_LIST_SIGNUP_MODES, CAMPAIGN_SLUG, CAMPAIGN_CHANNELS } from '../../utils/schemas'

// The staff form of a list: its state, the schema `UForm` checks it with, and the request body.

export type CampaignListFormState = {
  name: Translated | undefined
  slug: string
  description: Translated | undefined
  channels: CampaignChannel[]
  doubleOptIn: boolean
  public: boolean
  signupMode: CampaignListSignupMode
  consentText: Translated | undefined
  /** A forms form whose submissions sign people up (`undefined`: none), and which of its fields hold what. */
  formId: string | undefined
  formFields: Required<Record<keyof CampaignFormFields, string>>
}

const emptyFormFields = (): CampaignListFormState['formFields'] => ({ email: '', phone: '', name: '', consent: '' })

const hasText = (value: Translated | null | undefined) => !!value && (typeof value === 'string' ? !!value.trim() : Object.values(value).some(text => text.trim()))

type T = (key: string, fallback: string) => string

/** The form's schema, with messages in the staff member's language. */
export function campaignListFormSchema(t: T) {
  return z.object({
    name: z.custom<Translated | undefined>(value => hasText(value as Translated | undefined), t('admin.form.nameRequired', 'Give the list a name.')),
    slug: z.string().trim().min(1, t('admin.form.slugRequired', 'Give the list a URL name.')).max(64).regex(CAMPAIGN_SLUG, t('admin.form.slugInvalid', 'Use lowercase letters, digits and dashes.')),
    description: z.custom<Translated | undefined>(),
    channels: z.array(z.enum(CAMPAIGN_CHANNELS)).min(1, t('admin.form.channelsRequired', 'Pick at least one channel.')),
    doubleOptIn: z.boolean(),
    public: z.boolean(),
    signupMode: z.enum(CAMPAIGN_LIST_SIGNUP_MODES),
    consentText: z.custom<Translated | undefined>(),
    formId: z.string().optional(),
    formFields: z.object({ email: z.string(), phone: z.string(), name: z.string(), consent: z.string() }),
  }).superRefine((value, ctx) => {
    if (!value.formId) return
    if (!value.formFields.consent) ctx.addIssue({ code: 'custom', path: ['formFields', 'consent'], message: t('admin.form.formConsentRequired', 'Pick the field people tick to agree.') })
    if (!value.formFields.email && !value.formFields.phone) ctx.addIssue({ code: 'custom', path: ['formFields', 'email'], message: t('admin.form.formAddressRequired', 'Pick the field with the email address or the phone number.') })
  })
}

export const emptyCampaignListForm = (): CampaignListFormState => ({
  name: undefined,
  slug: '',
  description: undefined,
  channels: ['email'],
  doubleOptIn: true,
  public: true,
  signupMode: 'off',
  consentText: undefined,
  formId: undefined,
  formFields: emptyFormFields(),
})

export const campaignListToForm = (list: CampaignListDto): CampaignListFormState => ({
  name: list.name,
  slug: list.slug,
  description: list.description ?? undefined,
  channels: [...list.channels],
  doubleOptIn: list.doubleOptIn,
  public: list.public,
  signupMode: list.signupMode,
  consentText: list.consentText ?? undefined,
  formId: list.formId ?? undefined,
  formFields: { ...emptyFormFields(), ...list.formFields },
})

/** The request body of a create (POST) or edit (PATCH): empty texts are `null`. */
export const campaignListFormBody = (state: CampaignListFormState) => ({
  name: state.name,
  slug: state.slug.trim(),
  description: hasText(state.description) ? state.description : null,
  channels: state.channels,
  doubleOptIn: state.doubleOptIn,
  public: state.public,
  signupMode: state.signupMode,
  consentText: hasText(state.consentText) ? state.consentText : null,
  formId: state.formId || null,
  formFields: state.formId
    ? Object.fromEntries(Object.entries(state.formFields).filter(([, key]) => key)) as CampaignFormFields
    : null,
})

/** A URL name from a name: lowercase ASCII letters and digits joined by dashes. */
export function campaignSlugify(value: string): string {
  return value.toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
}
