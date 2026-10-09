import type { H3Event } from 'h3'

/** A text that is either one string or a map of locale -> string. */
export type Translated = string | Record<string, string>

export type FormStatus = 'draft' | 'published' | 'archived'
export type FormMode = 'single' | 'stepped'
export type FormStorage = 'db' | 'none'
export type DeliveryStatus = 'none' | 'pending' | 'delivered' | 'failed'

export type FieldType
  = 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'date' | 'file' | 'markdown'

export type ConditionOp = 'eq' | 'neq' | 'in' | 'truthy'

/** Shows a field (or step) only while the condition on another field's answer holds. */
export type Condition = {
  /** Key of the field whose answer is inspected. */
  field: string
  op: ConditionOp
  /** Compared value for `eq`/`neq`; a list of accepted values for `in`. Unused for `truthy`. */
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
    /** Recipient addresses. */
    to: string[]
    subject?: Translated
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

export type FormDefinition = {
  mode: FormMode
  /** `none` never stores answers (or files): they are only emitted through `forms:submitted` and emailed. */
  storage: FormStorage
  steps: FormStep[]
  submit?: FormSubmitSettings
  delivery?: FormDelivery
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
}

export type PublicModuleOptions = {
  pages: {
    form?: string
    admin?: string
    adminForm?: string
    adminSubmissions?: string
    adminSubmission?: string
  }
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
