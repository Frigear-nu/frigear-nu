import { z } from 'zod/v4'

export const contactFormSubjectOptions = {
  apps: 'Apps',
  websites: 'Nettsider',
  development: 'Utvikling',
  support: 'Support',
  consulting: 'Rådgivning',
  courses: 'Kurs',
  other: 'Annet',
} as const

export const contactFormSubjectSelectItems = Object.entries(contactFormSubjectOptions).map(([key, value]) => ({ value: key, label: value }))

export const contactFormSubjectKeys = Object.keys(contactFormSubjectOptions) as [
  keyof typeof contactFormSubjectOptions,
  ...Array<keyof typeof contactFormSubjectOptions>,
]

export const contactFormSchema = z
  .object({
    name: z.string({ message: 'Navn er påkrevd.' }),
    email: z
      .string({ message: 'E-post er påkrevd.' })
      .email('Dette må være en gyldig e-postadresse.'),
    phone: z.string().optional(),
    subject: z.enum(contactFormSubjectKeys, { message: 'Emne er påkrevd.' }),
    // optional in base schema, we enforce the condition below
    subjectOther: z.string().optional(),
    message: z
      .string({ message: 'Beskjed feltet er påkrevd.' })
      .nonempty('Beskjed feltet er påkrevd.'),
    _token: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.subject === 'other' && data.subjectOther?.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subjectOther'],
        message: 'Du må fylle ut feltet fordi du har valgt "annet".',
      })
    }
  })

export type ContactSchema = z.output<typeof contactFormSchema>
