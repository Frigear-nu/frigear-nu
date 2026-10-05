import { z } from 'zod'
import { createEmailSchema, createNameSchema, createPhoneSchema } from '../shared'

//* Subjects

export const contactSubjectKeys = [
  'volunteering',
  'partnership',
  'support',
  'payment',
  'governance',
  'finance',
  'complaint',
  'other',
] as const

export type ContactSubjectKey = (typeof contactSubjectKeys)[number]

// todo: remove this and replace with the full translation path to be used in the sending of contact form.
export const contactSubjectLabels: Record<ContactSubjectKey, string> = {
  volunteering: 'Frivillig',
  partnership: 'Samarbejde',
  support: 'Support',
  payment: 'Betaling',
  governance: 'Bestyrelse',
  finance: 'Økonomi',
  complaint: 'Klage',
  other: 'Andet',
} as const

export const contactFormSchema = z
  .object({
    name: createNameSchema(),
    email: createEmailSchema(),
    phone: createPhoneSchema()
      .optional(),
    phonePrefix: z.string().optional(),
    subject: z.enum(contactSubjectKeys),
    subjectOther: z.string().trim().max(120).optional(),
    message: z.string().min(1).max(5000),
  })
  .superRefine((data, ctx) => {
    if (data.subject === 'other' && !data.subjectOther?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subjectOther'],
        params: {
          i18n: {
            key: 'zodI18n.errors.too_small.string.inclusive',
            values: {
              minimum: 1,
            },
          },
        },
      })
    }
  })

export type ContactFormSchema = z.output<typeof contactFormSchema>
