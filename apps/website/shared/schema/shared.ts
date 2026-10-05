import { z } from 'zod'

export const createNameSchema = () => z.string().min(2).max(255)

export const createEmailSchema = () => z.string().trim().email().toLowerCase()

export const createPhoneSchema = () => z
  .preprocess(
    (v) => {
      if (typeof v !== 'string')
        return v

      return v.replace(/[\s-]/g, '')
    },
    z.string().superRefine((v, ctx) => {
      if (!/^\d{8}$/.test(v)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          params: {
            i18n: {
              key: 'zodI18n.errors.too_big.phone.exact',
              values: {
                maximum: 8,
              },
            },
          },
        })
      }
    }),
  )
