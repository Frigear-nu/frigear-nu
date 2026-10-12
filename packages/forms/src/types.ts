import type { H3Event } from 'h3'

/** A text that is either one string or a map of locale -> string. */
export type Translated = string | Record<string, string>

export type FormStatus = 'draft' | 'published' | 'archived'
export type FormMode = 'single' | 'stepped'
export type FormStorage = 'db' | 'none'
export type DeliveryStatus = 'none' | 'pending' | 'delivered' | 'failed'

export type FieldType
  = 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date' | 'file' | 'markdown' | 'captcha'

export type CaptchaProvider = 'turnstile' | 'recaptcha' | 'hcaptcha'

export type ConditionOp = 'eq' | 'neq' | 'in' | 'empty' | 'notEmpty' | 'truthy'

/** Shows a field (or step) only while the condition on another field's answer holds. */
export type Condition = {
  /** Key of the field whose answer is inspected. */
  field: string
  op: ConditionOp
  /** Compared value for `eq`/`neq`; a list of accepted values for `in`. Unused for `empty`, `notEmpty` and `truthy` (an alias of `notEmpty`). */
  value?: unknown
}

export type FieldOption = { value: string, label: Translated }

export type FieldValidation = {
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  /** Regular expression source the (non-empty) value must match. */
  pattern?: string
  /** Files only. */
  maxFiles?: number
  /** Files only, bytes per file. */
  maxSize?: number
  /** Files only, accepted MIME types or `type/*` wildcards. */
  accept?: string[]
  /** Replaces the default error message of every rule on this field. */
  message?: Translated
}

/** Settings of a `captcha` field. The visitor's response token lives in the form state only and is never stored. */
export type CaptchaConfig = {
  /** Defaults to `turnstile`. */
  provider?: CaptchaProvider
  /** Public site key; overrides `runtimeConfig.public.forms.captcha.<provider>.siteKey` for this field. */
  siteKey?: string
  theme?: 'auto' | 'light' | 'dark'
  size?: 'normal' | 'compact'
}

export type FormField = {
  /** Unique across the whole form; the key of the answer. */
  key: string
  type: FieldType
  /** Markdown text for `markdown` fields (they collect no answer). */
  content?: Translated
  label?: Translated
  description?: Translated
  placeholder?: Translated
  required?: boolean
  options?: FieldOption[]
  /** `file` fields only: allow more than one file. */
  multiple?: boolean
  /** Browser `autocomplete` token, e.g. `email`. */
  autocomplete?: string
  validation?: FieldValidation
  /** `captcha` fields only. */
  captcha?: CaptchaConfig
  showIf?: Condition
}

export type FormStep = {
  /** Unique across the form. */
  id: string
  title?: Translated
  description?: Translated
  showIf?: Condition
  fields: FormField[]
}

export type FormDelivery = {
  email?: {
    /** Recipient addresses; used when no `routes` entry matches. */
    to: string[]
    /** May use `{{variables}}` (see the forms docs). */
    subject?: Translated
    /**
     * Custom plain-text body with `{{variables}}` (`{{answers}}`, `{{answer.<key>}}`, `{{form.name}}`, ...).
     * Without it the email lists the answers.
     */
    body?: Translated
    /** Sends to different recipients depending on the answer of one field (e.g. a subject select). */
    routes?: { field: string, to: Record<string, string[]> }
    /** Key of an email field whose answer becomes the `Reply-To` of the delivered email. */
    replyToField?: string
  }
}

export type FormSubmitSettings = {
  label?: Translated
  successMessage?: Translated
  /** Same-origin path to go to after a successful submit. */
  redirect?: string
  /** Offers "send another" after submit; these field keys stay filled in. */
  allowResubmit?: { keep: string[] }
}

/** `web`: public page and API. `api`: API only, the public page does not exist. */
export type FormAvailability = 'web' | 'api'
/** How a submitter proves access: nothing, a signed-in user, a bearer token or a shared password. */
export type FormAuthMode = 'none' | 'user' | 'token' | 'password'

/** Who may read and submit the form. Secrets (tokens, password hash) are never part of the definition. */
export type FormAccess = {
  availability: FormAvailability
  auth: FormAuthMode
}

export type FormDefinition = {
  mode: FormMode
  /** `none` never stores answers (or files): they are only emitted through `forms:submitted` and emailed. */
  storage: FormStorage
  steps: FormStep[]
  submit?: FormSubmitSettings
  delivery?: FormDelivery
  /** Defaults to `{ availability: 'web', auth: 'none' }` (open to everyone, as forms always were). */
  access?: FormAccess
}

export type ModuleOptions = {
  settings?: {
    pages?: {
      /** Public form page; must contain a `:slug` param. `true` = `/forms/:slug`. */
      form?: string | boolean
      /** Admin list of forms. `true` = `/admin/forms`. */
      admin?: string | boolean
      /** Admin form editor; must contain an `:id` param. `true` = `/admin/forms/:id`. */
      adminForm?: string | boolean
      /** Admin submissions of one form; must contain an `:id` param. `true` = `/admin/forms/:id/submissions`. */
      adminSubmissions?: string | boolean
      /** One submission; must contain `:id` and `:submissionId`. `true` = `/admin/forms/:id/submissions/:submissionId`. */
      adminSubmission?: string | boolean
    }
    /** Submissions allowed per client and form within `rateLimitWindowSeconds`. Defaults to `10`. `0` disables. */
    rateLimit?: number
    /** Defaults to `600`. */
    rateLimitWindowSeconds?: number
  }
  /**
   * Opt-in seeding. Nothing is ever inserted unless `enabled` is `true`; then only slugs that
   * do not exist yet are inserted (existing forms are never overwritten).
   */
  seed?: {
    enabled?: boolean
    forms?: SeedForm[]
  }
  /**
   * Keys for `captcha` fields. Site keys are public, secret keys stay on the server. Both can be set per
   * provider here or through `NUXT_PUBLIC_FORMS_CAPTCHA_<PROVIDER>_SITE_KEY` / `NUXT_FORMS_CAPTCHA_<PROVIDER>_SECRET_KEY`.
   */
  captcha?: Partial<Record<CaptchaProvider, { siteKey?: string, secretKey?: string }>> & {
    /** Provider of a captcha field that does not name one. Defaults to `turnstile`; env `NUXT_PUBLIC_FORMS_CAPTCHA_DEFAULT_PROVIDER`. */
    defaultProvider?: CaptchaProvider
  }
  /**
   * Key that encrypts per-form secrets in the database (env `NUXT_FORMS_ENCRYPTION_KEY`). Falls back to
   * `NUXT_ENCRYPTION_KEY`, then to the session password. Changing it makes stored secrets unreadable.
   */
  encryptionKey?: string
}

export type SeedForm = {
  slug: string
  name: string
  status?: FormStatus
  definition: FormDefinition
}

export type FormsRuntimeConfig = {
  rateLimit: number
  rateLimitWindowSeconds: number
  seed: { enabled: boolean, forms: SeedForm[] }
  captcha: Record<CaptchaProvider, { secretKey: string }>
  encryptionKey: string
}

export type PublicModuleOptions = {
  pages: {
    form?: string
    admin?: string
    adminForm?: string
    adminSubmissions?: string
    adminSubmission?: string
  }
  captcha: Record<CaptchaProvider, { siteKey: string }> & { defaultProvider: CaptchaProvider }
}

export type AuthorizeContext = { event: H3Event, userId: number, allowed: boolean }

export type SubmittedFile = {
  fieldKey: string
  filename: string
  contentType: string
  size: number
  /** Blob pathname; `null` when the form does not store (`storage: 'none'` never has files). */
  pathname: string | null
}

export type SubmittedContext = {
  event: H3Event
  form: { id: string, slug: string, name: string, version: number, definition: FormDefinition }
  /** Validated answers keyed by field key. File fields hold the file names. */
  answers: Record<string, unknown>
  files: SubmittedFile[]
  locale: string
  userId: number | null
  /** `null` when the form has `storage: 'none'`. */
  submissionId: string | null
  stored: boolean
  /** Set by a handler to report that it delivered the submission (email delivery does). */
  delivered: boolean
}

export type CaptchaVerifyContext = {
  event: H3Event
  provider: CaptchaProvider
  token: string
  ip: string | undefined
  /** The form being submitted, when known. */
  formId?: string
  /**
   * The secret key the siteverify call would use: the form's own encrypted secret, else the environment/config
   * one, else `undefined` (which fails closed). Server-side only, never sent anywhere but the provider.
   */
  secretKey?: string
  secretSource?: SecretSource
  /** Set by a handler to decide the outcome; left `undefined` the provider's siteverify endpoint is asked. */
  valid: boolean | undefined
}

export type DeliveredContext = {
  submissionId: string | null
  formSlug: string
  status: 'delivered' | 'failed'
  error?: string
}

// --- API DTOs -----------------------------------------------------------------------------------

export type PublicFormDto = {
  id: string
  slug: string
  name: string
  version: number
  /** The definition without `delivery` (recipients are never public). */
  definition: Omit<FormDefinition, 'delivery'>
}

export type FormAccessTokenDto = {
  id: string
  name: string
  /** First characters of the token, to recognise it; the token itself is shown once on creation. */
  prefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export type CreatedFormAccessTokenDto = FormAccessTokenDto & { token: string }

export type FormPasswordStatusDto = { set: boolean }

/** Where a captcha secret key comes from: the form's encrypted secret, the environment/config, or nowhere. */
export type SecretSource = 'form' | 'env' | 'unset'

/** Which per-form secrets are set. Names only: values are write-only and never leave the server. */
export type FormSecretsDto = {
  /** Names of the secrets stored for this form. */
  keys: string[]
  /** Per captcha provider, which secret key a submission would use. */
  captcha: Record<CaptchaProvider, { source: SecretSource }>
  /** The stored secrets cannot be decrypted (the encryption key changed); set them again. */
  unreadable: boolean
}

/** What the public page needs to decide between the form, a gate and "not found". Never contains secrets. */
export type FormAccessInfoDto = {
  slug: string
  name: string
  access: FormAccess
  signedIn: boolean
}

export type FormSummaryDto = {
  id: string
  slug: string
  name: string
  status: FormStatus
  version: number
  storage: FormStorage
  mode: FormMode
  submissionCount: number
  updatedAt: string
}

export type FormAdminDto = {
  id: string
  slug: string
  name: string
  status: FormStatus
  version: number
  definition: FormDefinition
  /** Stored submissions; only set when the form is fetched on its own. Can be above 0 even when storage is now `none`. */
  submissionCount?: number
  createdAt: string
  updatedAt: string
}

export type SubmissionSummaryDto = {
  id: string
  createdAt: string
  locale: string
  userId: number | null
  deliveryStatus: DeliveryStatus
  /** First few answers as `label: value`, for the list view. */
  preview: { label: string, value: string }[]
}

export type SubmissionFileDto = {
  id: string
  fieldKey: string
  filename: string
  contentType: string
  size: number
}

export type SubmissionDto = {
  id: string
  formId: string
  formSlug: string
  formVersion: number
  definition: FormDefinition
  answers: Record<string, unknown>
  files: SubmissionFileDto[]
  locale: string
  userId: number | null
  deliveryStatus: DeliveryStatus
  deliveryError: string | null
  createdAt: string
}

export type SubmitResponse = { ok: true, id: string | null }

/** Descriptor of a picked/uploaded file, as validated on both client and server. */
export type FileDescriptor = { name: string, size: number, type: string }
