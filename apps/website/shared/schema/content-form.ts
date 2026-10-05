import { z } from 'zod/v4'
import { defineSteppedForm } from '../form'

export const FieldTypeSchema = z.enum([
  'text', 'email', 'password',
  'number', 'date', 'datetime',
  'textarea', 'file', 'select',
  'combobox', 'radio', 'checkbox',
])

export type FieldType = z.infer<typeof FieldTypeSchema>

// Raw field shape as it appears in YAML — rules string, no type field
export const ContentFieldSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  rules: z.string().optional(),
})

export const ContentStepSchema = z.object({
  id: z.string(),
  icon: z.string().optional(),
  fields: z.array(ContentFieldSchema),
  info: z.union([
    z.string(),
    z.object({
      content: z.string(),
      icon: z.string().optional(),
    }),
  ]),
  // Optional: explicit JSON Schema override for a step
  schema: z.record(z.string(), z.any()).optional(),
})

// TODO: Combine many of the simple schema composites.
const environment = z.enum(['production', 'staging', 'development'])
const variables = z.union([
  z.record(
    environment,
    z.record(z.string(), z.string()),
  ),
  z.record(z.string(), z.string()),
])

export const CollectionFormSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  path: z.string().optional(),
  form: z.object({
    steps: z.array(ContentStepSchema),
  }),
  preview: z.array(z.string()).optional(),
  variables: variables.optional(),
  delivery: z.array(z.union([
    z.object({
      channel: z.literal('email'),
      destination: z.array(z.string()),
    }),
    z.object({
      channel: z.literal('webhook'),
      destination: z.array(z.string()),
      method: z.enum(['POST', 'PUT', 'PATCH', 'DELETE']).optional(),
      headers: z.record(z.string(), z.string()).optional(),
    }),
  ])),
  resubmittable: z.union([
    z.boolean(),
    z.object({
      start: z.string().optional(),
      fields: z.array(z.string()),
      alert: z.object({
        title: z.string(),
        description: z.string(),
        color: z.enum(['success', 'warning', 'info', 'error', 'primary', 'secondary']).optional(),
      }).optional(),
    }),
  ]).optional(),
})

export type CollectionForm = z.infer<typeof CollectionFormSchema>
export type ContentStep = z.infer<typeof ContentStepSchema>
export type ContentField = z.infer<typeof ContentFieldSchema>

interface ParsedRules {
  type: FieldType
  required: boolean
  isArray: boolean
  min?: number
  max?: number
  maxsize?: number
}

const RULES_TYPE_MAP: Partial<Record<string, FieldType>> = {
  text: 'text',
  email: 'email',
  password: 'password',
  number: 'number',
  date: 'date',
  datetime: 'datetime',
  textarea: 'textarea',
  file: 'file',
  select: 'select',
  combobox: 'combobox',
  radio: 'radio',
  checkbox: 'checkbox',
}

export function parseRules(rules: string = ''): ParsedRules {
  const parts = rules.split('|').map(p => p.trim()).filter(Boolean)

  const type = parts.find(p => p in RULES_TYPE_MAP)
  const numericArg = (prefix: string) => {
    const match = parts.find(p => p.startsWith(`${prefix}:`))
    return match ? Number(match.split(':')[1]) : undefined
  }

  return {
    type: (type ? RULES_TYPE_MAP[type] : 'text') as FieldType,
    required: parts.includes('required'),
    isArray: parts.includes('array'),
    min: numericArg('min'),
    max: numericArg('max'),
    maxsize: numericArg('maxsize'),
  }
}

// ─── Zod Schema Builder ───────────────────────────────────────────────────────

export function fieldSchemaFromRules(field: ContentField): z.ZodType {
  const { type, required, isArray, min, max } = parseRules(field.rules)

  let schema: z.ZodType = buildBaseSchema(type, { min, max })

  if (isArray) schema = z.array(schema)
  if (!required) schema = schema.optional()

  return schema.meta({ type, title: field.label })
}

function buildBaseSchema(
  type: FieldType,
  constraints: { min?: number, max?: number },
): z.ZodType {
  const { min, max } = constraints

  switch (type) {
    case 'number':
      return applyNumericConstraints(z.number(), min, max)

    case 'date':
      return z.iso.date()

    case 'datetime':
      return z.iso.datetime()

    case 'file':
      // File validation happens at the transport layer (multipart),
      // use z.string() as a stand-in for the filename/path in JSON bodies
      return z.string()

    case 'checkbox':
      return z.boolean()

    case 'email':
      return z.email()

    default: {
      return applyStringConstraints(z.string(), min, max)
    }
  }
}

function applyStringConstraints(s: z.ZodString, min?: number, max?: number) {
  if (min !== undefined) s = s.min(min)
  if (max !== undefined) s = s.max(max)
  return s
}

function applyNumericConstraints(n: z.ZodNumber, min?: number, max?: number) {
  if (min !== undefined) n = n.gte(min)
  if (max !== undefined) n = n.lte(max)
  return n
}

export function formFromCollectionContent(content: CollectionForm) {
  return defineSteppedForm({
    id: content.name,
    steps: content.form.steps.map((step: ContentStep) => ({
      id: step.id,
      icon: step.icon,
      hint: typeof step.info === 'string'
        ? step.info
        : {
            content: step.info.content,
            icon: step.info.icon,
          },
      schema: z.object(
        Object.fromEntries(
          step.fields.map((field: ContentField) => [field.name, fieldSchemaFromRules(field)]),
        ),
      ),
    })),
  })
}
