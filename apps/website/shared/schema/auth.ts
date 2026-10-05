import { z } from 'zod'
import { createEmailSchema, createNameSchema } from './shared'

export const forgotPasswordSchema = z.object({
  email: createEmailSchema(),
  _token: z.string().optional(),
})

export type ForgotPasswordSchema = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z.object({
  code: z.string(),
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
}).refine(data => data.password === data.confirmPassword, {
  // FIXME: Make this a FN and add issue to ctx.
  message: 'errors.password.mismatch',
  path: ['confirmPassword'],
  params: {
    i18n: {
      // FIXME: Change path and add translations.
      key: 'zodI18n.password.mismatch',
    },
  },
})

export type ResetPasswordSchema = z.infer<typeof resetPasswordSchema>

const redirectSchema = z.string().refine((url) => {
  return url.startsWith('/') && !url.startsWith('//')
})

export const signInWithPasswordSchema = z.object({
  email: createEmailSchema(),
  password: z.string(),
  redirect: redirectSchema.optional(),
  _token: z.string().optional(),
})

export type SignInWithPasswordSchema = z.infer<typeof signInWithPasswordSchema>

export const signUpWithPasswordSchema = signInWithPasswordSchema.extend({
  name: createNameSchema(),
  email: createEmailSchema(),
  password: z.string().min(6),
  redirect: redirectSchema.optional(),
  _token: z.string().optional(),
})

export type SignUpWithPasswordSchema = z.infer<typeof signUpWithPasswordSchema>

export const signInWithMagicLinkTokenSchema = z.object({
  code: z.string(),
  redirect: redirectSchema.optional(),
})

export type SignInWithMagicLinkTokenSchema = z.infer<typeof signInWithMagicLinkTokenSchema>

export const signInWithMagicLinkSchema = z.object({
  email: createEmailSchema(),
  redirect: redirectSchema.optional(),
})

export type SignInWithMagicLinkSchema = z.infer<typeof signInWithMagicLinkSchema>

export const signUpWithMagicLinkSchema = signInWithMagicLinkSchema.extend({
  name: createNameSchema(),
  email: createEmailSchema(),
  redirect: redirectSchema.optional(),
})

export type SignUpWithMagicLinkSchema = z.infer<typeof signUpWithMagicLinkSchema>
