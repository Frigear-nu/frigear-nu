import { z } from 'zod/v4'
import { userRoles } from '#shared/schema/user'

const phone = z.string().optional().nullish().meta({
  description: 'Phone number in format +4512345678',
})

const roskildePeopleId = z.coerce.number().optional().nullish().meta({
  title: 'Roskilde People ID',
  description: 'Exactly as shown in People Vol.',
  input: {
    props: {
      increment: false,
      decrement: false,
      formatOptions: {
        useGrouping: false,
      },
    },
  },
})

export const adminCreateUserSchema = z.object({
  name: z.string(),
  email: z.email().toLowerCase(),
  role: z.enum(userRoles).default('user'),
  phone,
  roskildePeopleId,
  sendWelcomeEmail: z.boolean().default(true),
  emailVerified: z.boolean().default(false),
})

export type AdminCreateUserSchema = z.infer<typeof adminCreateUserSchema>

export const adminUpdateUserSchema = z.object({
  name: z.string(),
  email: z.email(),
  role: z.enum(userRoles),
  phone,
  roskildePeopleId,
})

export type AdminUpdateUserSchema = z.infer<typeof adminUpdateUserSchema>
