import { z } from 'zod'
import type { FormDefinition, FormField } from '../../types'
import { isInputField, resolveVisibility } from './conditions'
import type { Answers } from './conditions'
import { defaultMessages, translate } from './text'
import type { MessageTranslator } from './text'

export type SchemaOptions = {
  /** Translates the messages of rules the compiler adds itself. Defaults to English. */
  t?: MessageTranslator
  /** Locale used for `validation.message` overrides from the definition. */
  locale?: string
}

const EMAIL = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/
const PHONE = /^[+()\d\s-]{5,}$/
const DATE = /^\d{4}-\d{2}-\d{2}/

/** Applied when a file field sets no `maxSize` / `maxFiles`, so uploads are always bounded. */
export const DEFAULT_MAX_FILE_SIZE = 10_000_000
export const DEFAULT_MAX_FILES = 10

const fileSchema = z.object({ name: z.string(), size: z.number(), type: z.string() })

const matchesAccept = (type: string, accept: string[]) =>
  accept.some(rule => rule.endsWith('/*') ? type.startsWith(rule.slice(0, -1)) : type === rule)

/** Builds the zod schema of a single field. */
export function buildFieldSchema(field: FormField, options: SchemaOptions = {}): z.ZodType {
  const t = options.t ?? defaultMessages
  const rules = field.validation ?? {}
  const required = Boolean(field.required)
  const override = rules.message ? translate(rules.message, options.locale) : undefined
  const message = (key: string, fallback: string, params?: Record<string, string | number>) =>
    override ?? t(`validation.${key}`, fallback, params)
  const requiredMessage = () => message('required', 'This field is required.')

  if (field.type === 'checkbox') {
    const boolean = z.boolean({ error: requiredMessage })
    return required ? boolean.refine(value => value === true, { error: requiredMessage }) : boolean.optional()
  }

  if (field.type === 'file') {
    const files = z.array(fileSchema, { error: requiredMessage }).superRefine((value, ctx) => {
      if (required && value.length === 0) ctx.addIssue({ code: 'custom', message: requiredMessage() })
      const maxFiles = rules.maxFiles ?? (field.multiple ? DEFAULT_MAX_FILES : 1)
      if (value.length > maxFiles) {
        ctx.addIssue({ code: 'custom', message: message('maxFiles', 'Upload at most {max} file(s).', { max: maxFiles }) })
      }
      const maxSize = rules.maxSize ?? DEFAULT_MAX_FILE_SIZE
      for (const file of value) {
        if (file.size > maxSize) {
          ctx.addIssue({
            code: 'custom',
            message: message('maxSize', '{name} is larger than {max} MB.', { name: file.name, max: Math.round((maxSize / 1_000_000) * 10) / 10 }),
          })
        }
        if (rules.accept?.length && !matchesAccept(file.type, rules.accept)) {
          ctx.addIssue({ code: 'custom', message: message('accept', '{name} is not an accepted file type.', { name: file.name }) })
        }
      }
    })
    return required ? files : files.optional()
  }

  if (field.type === 'number') {
    const number = z.number({ error: requiredMessage }).superRefine((value, ctx) => {
      if (rules.min !== undefined && value < rules.min) {
        ctx.addIssue({ code: 'custom', message: message('min', 'Must be at least {min}.', { min: rules.min }) })
      }
      if (rules.max !== undefined && value > rules.max) {
        ctx.addIssue({ code: 'custom', message: message('max', 'Must be at most {max}.', { max: rules.max }) })
      }
    })
    return required ? number : number.nullish()
  }

  const allowed = field.options?.map(option => option.value)
  const text = z.string({ error: requiredMessage }).superRefine((raw, ctx) => {
    const value = raw.trim()
    if (!value) {
      if (required) ctx.addIssue({ code: 'custom', message: requiredMessage() })
      return
    }
    if (field.type === 'email' && !EMAIL.test(value)) {
      ctx.addIssue({ code: 'custom', message: message('email', 'Enter a valid email address.') })
    }
    if (field.type === 'tel' && !PHONE.test(value)) {
      ctx.addIssue({ code: 'custom', message: message('tel', 'Enter a valid phone number.') })
    }
    if (field.type === 'date' && !DATE.test(value)) {
      ctx.addIssue({ code: 'custom', message: message('date', 'Enter a valid date.') })
    }
    if ((field.type === 'select' || field.type === 'radio') && allowed && !allowed.includes(value)) {
      ctx.addIssue({ code: 'custom', message: message('option', 'Choose one of the available options.') })
    }
    if (rules.minLength !== undefined && value.length < rules.minLength) {
      ctx.addIssue({ code: 'custom', message: message('minLength', 'Enter at least {min} characters.', { min: rules.minLength }) })
    }
    if (rules.maxLength !== undefined && value.length > rules.maxLength) {
      ctx.addIssue({ code: 'custom', message: message('maxLength', 'Enter at most {max} characters.', { max: rules.maxLength }) })
    }
    if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
      ctx.addIssue({ code: 'custom', message: message('pattern', 'The value has an invalid format.') })
    }
  })
  return required ? text : text.optional()
}

/** Fields (with their step index) that take part in validation for these answers. */
export function validatedFields(definition: FormDefinition, answers: Answers, stepIndex?: number): FormField[] {
  return resolveVisibility(definition, answers)
    .filter(visible => stepIndex === undefined || visible.index === stepIndex)
    .flatMap(visible => visible.fields)
    .filter(isInputField)
}

/**
 * Compiles the definition into a zod object for the answers given. Only visible fields are part
 * of the schema, so hidden fields are never required and their answers are stripped.
 * Pass `stepIndex` to validate one step (stepped client), omit it for the whole form (server).
 */
export function buildFormSchema(definition: FormDefinition, answers: Answers, options: SchemaOptions & { stepIndex?: number } = {}) {
  const shape: Record<string, z.ZodType> = {}
  for (const field of validatedFields(definition, answers, options.stepIndex)) {
    shape[field.key] = buildFieldSchema(field, options)
  }
  return z.object(shape)
}
