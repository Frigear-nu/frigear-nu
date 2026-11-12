import { z } from 'zod'
import { createEmailSchema, createNameSchema } from './shared'

export const updateUserProfileSchema = z.object({
  name: createNameSchema(),
  // We want to have a separate process of changing email.
  // FIXME: Add verification for new email
  //  1. Send confirmation to new email.
  //  2. Change email in DB.
  //  3. Send info mail to old address.
  // email: createEmailSchema(),
  // FIXME: User avatars
  avatar: z.string().optional(),
})

export type UpdateUserProfileSchema = z.output<typeof updateUserProfileSchema>

export const changeUserEmailSchema = z.object({
  email: createEmailSchema(),
})

export type ChangeUserEmailSchema = z.output<typeof changeUserEmailSchema>

export const verifyChangeEmailSchema = z.object({
  token: z.string(),
})

export type VerifyChangeEmailSchema = z.output<typeof verifyChangeEmailSchema>

export const changeUserPasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(6),
  confirmNewPassword: z.string().min(6),
}).refine(data => data.newPassword === data.confirmNewPassword, {
  // FIXME: Make this a FN and add issue to ctx.
  message: 'errors.password.mismatch',
  path: ['confirmNewPassword'],
  params: {
    i18n: {
      // FIXME: Change path and add translations.
      key: 'zodI18n.password.mismatch',
    },
  },
})

export type ChangeUserPasswordSchema = z.infer<typeof changeUserPasswordSchema>
