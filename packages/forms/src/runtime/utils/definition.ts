import { z } from 'zod'
import { scheduleSchema } from '@frigear-nu/module-kit/schedule'
import { isPhoneCountry } from './phone'
import type { FormAccess, FormDefinition } from '../../types'

const translated = z.union([z.string(), z.record(z.string(), z.string())])

const MAX_BODY = 10_000
const bodyText = z.union([
  z.string().max(MAX_BODY),
  z.record(z.string(), z.string().max(MAX_BODY)),
])

const KEY = /^[a-z]\w*$/i
const ID = /^[a-z0-9][\w-]*$/i

const condition = z.object({
  field: z.string().regex(KEY),
  op: z.enum(['eq', 'neq', 'in', 'empty', 'notEmpty', 'truthy']),
  value: z.unknown().optional(),
})

const field = z.object({
  key: z.string().regex(KEY, 'Field keys must start with a letter and contain only letters, digits and underscores.'),
  type: z.enum(['text', 'email', 'tel', 'number', 'textarea', 'select', 'radio', 'checkbox', 'date', 'file', 'markdown', 'captcha']),
  content: translated.optional(),
  label: translated.optional(),
  description: translated.optional(),
  placeholder: translated.optional(),
  required: z.boolean().optional(),
  options: z.array(z.object({ value: z.string().min(1), label: translated })).optional(),
  multiple: z.boolean().optional(),
  autocomplete: z.string().max(40).optional(),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    minLength: z.number().int().min(0).optional(),
    maxLength: z.number().int().min(1).optional(),
    pattern: z.string().max(500).optional(),
    maxFiles: z.number().int().min(1).max(50).optional(),
    maxSize: z.number().int().min(1).optional(),
    accept: z.array(z.string()).optional(),
    message: translated.optional(),
  }).optional(),
  phone: z.object({
    mode: z.enum(['simple', 'country']).optional(),
    countries: z.array(z.string().toUpperCase().refine(isPhoneCountry, 'Unknown country code.')).max(300).optional(),
    defaultCountry: z.string().toUpperCase().refine(isPhoneCountry, 'Unknown country code.').optional(),
  }).optional(),
  captcha: z.object({
    provider: z.enum(['turnstile', 'recaptcha', 'hcaptcha']).optional(),
    siteKey: z.string().max(200).regex(/^[\w-]*$/, 'Site keys contain only letters, digits, dashes and underscores.').optional(),
    theme: z.enum(['auto', 'light', 'dark']).optional(),
    size: z.enum(['normal', 'compact']).optional(),
  }).optional(),
  showIf: condition.optional(),
})

const step = z.object({
  id: z.string().regex(ID),
  title: translated.optional(),
  description: translated.optional(),
  showIf: condition.optional(),
  fields: z.array(field),
})

const sameOriginPath = (value: string) => value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
// Recipients are literal addresses: an unresolved `${...}` placeholder must never become one.
const emailAddress = z.string().regex(/^[^\s@${}]+@[^\s$@{}][^\s$.@{}]*\.[^\s$@{}]+$/, 'Recipients must be plain email addresses.')

export const accessSchema = z.object({
  availability: z.enum(['web', 'api']).default('web'),
  auth: z.enum(['none', 'user', 'token', 'password']).default('none'),
  schedule: scheduleSchema.optional(),
})

export const formDefinitionSchema = z.object({
  mode: z.enum(['single', 'stepped']),
  storage: z.enum(['db', 'none']).default('db'),
  steps: z.array(step).min(1),
  submit: z.object({
    label: translated.optional(),
    successMessage: translated.optional(),
    redirect: z.string().refine(sameOriginPath, 'Redirect must be a path on this site.').optional(),
    allowResubmit: z.object({ keep: z.array(z.string()) }).optional(),
  }).optional(),
  access: accessSchema.optional(),
  delivery: z.object({
    email: z.object({
      to: z.array(emailAddress).min(1),
      subject: translated.optional(),
      body: bodyText.optional(),
      routes: z.object({ field: z.string(), to: z.record(z.string(), z.array(emailAddress).min(1)) }).optional(),
      replyToField: z.string().optional(),
    }).optional(),
  }).optional(),
}).superRefine((definition, ctx) => {
  const fail = (message: string, path: (string | number)[]) => ctx.addIssue({ code: 'custom', message, path })

  if (definition.mode === 'single' && definition.steps.length !== 1) {
    fail('A single page form has exactly one step.', ['steps'])
  }

  // A bearer token cannot be typed into a web page, so token forms are API-only.
  if (definition.access?.auth === 'token' && definition.access.availability !== 'api') {
    fail('Token access needs the form to be API only.', ['access', 'availability'])
  }

  const stepIds = new Set<string>()
  const keys = new Map<string, string>()
  definition.steps.forEach((s, stepIndex) => {
    if (stepIds.has(s.id)) fail(`Duplicate step id "${s.id}".`, ['steps', stepIndex, 'id'])
    stepIds.add(s.id)

    s.fields.forEach((f, fieldIndex) => {
      const path = ['steps', stepIndex, 'fields', fieldIndex]
      if (keys.has(f.key)) fail(`Duplicate field key "${f.key}".`, [...path, 'key'])
      keys.set(f.key, f.type)

      if ((f.type === 'select' || f.type === 'radio') && !f.options?.length) {
        fail('Select and radio fields need options.', [...path, 'options'])
      }
      if (f.type === 'markdown' && !f.content) fail('Markdown fields need content.', [...path, 'content'])
      if (f.type === 'file' && definition.storage === 'none') {
        fail('File fields need a form that stores submissions (storage "db").', [...path, 'type'])
      }
      if (f.validation?.pattern) {
        try {
          new RegExp(f.validation.pattern)
        }
        catch {
          fail('Invalid regular expression.', [...path, 'validation', 'pattern'])
        }
      }
    })
  })

  // `showIf` must reference an input field defined earlier in the form (conditions only see
  // answers of fields before them).
  const seen = new Set<string>()
  definition.steps.forEach((s, stepIndex) => {
    const check = (cond: z.infer<typeof condition> | undefined, path: (string | number)[]) => {
      if (cond && !seen.has(cond.field)) fail(`Condition refers to unknown or later field "${cond.field}".`, path)
    }
    check(s.showIf, ['steps', stepIndex, 'showIf', 'field'])
    s.fields.forEach((f, fieldIndex) => {
      check(f.showIf, ['steps', stepIndex, 'fields', fieldIndex, 'showIf', 'field'])
      if (f.type !== 'markdown' && f.type !== 'captcha') seen.add(f.key)
    })
  })

  const emailDelivery = definition.delivery?.email
  if (emailDelivery?.routes && !seen.has(emailDelivery.routes.field)) {
    fail(`Unknown field "${emailDelivery.routes.field}".`, ['delivery', 'email', 'routes', 'field'])
  }
  if (emailDelivery?.replyToField && keys.get(emailDelivery.replyToField) !== 'email') {
    fail('Reply-to must be an email field.', ['delivery', 'email', 'replyToField'])
  }

  definition.submit?.allowResubmit?.keep.forEach((key, index) => {
    if (!keys.has(key)) fail(`Unknown field "${key}".`, ['submit', 'allowResubmit', 'keep', index])
  })
})

export type FormDefinitionInput = z.input<typeof formDefinitionSchema>

export function parseFormDefinition(input: unknown): FormDefinition {
  return formDefinitionSchema.parse(input) as FormDefinition
}

/** Recipients and reply-to of an email delivery for the given answers (a matching route wins over `to`). */
export function resolveEmailDelivery(email: NonNullable<NonNullable<FormDefinition['delivery']>['email']>, answers: Record<string, unknown>) {
  const routed = email.routes?.to[String(answers[email.routes.field] ?? '')]
  const replyTo = email.replyToField ? String(answers[email.replyToField] ?? '').trim() : ''
  return { to: routed?.length ? routed : email.to, replyTo: replyTo || undefined }
}

export const defaultAccess: FormAccess = { availability: 'web', auth: 'none' }

/** The effective access of a definition (older definitions have none and stay open). */
export function resolveAccess(definition: { access?: Partial<FormAccess> }): FormAccess {
  return { ...defaultAccess, ...definition.access }
}
