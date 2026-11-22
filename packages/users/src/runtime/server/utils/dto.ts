import { isoDate } from '@frigear-nu/module-kit/server'
import type { AdminUserDto, ProfileDto } from '../../../types'

/** The columns the DTOs read; `emailVerifiedAt` and `lastLoginAt` come from other modules' extensions. */
type UserRowLike = {
  id: number
  name: string
  email: string
  avatar?: string | null
  phone?: string | null
  locale?: string | null
  emailVerifiedAt?: Date | number | string | null
  lastLoginAt?: Date | number | string | null
  createdAt: Date | number | string
}

/**
 * A stored user as the users admin returns it: an allowlist (never the password hash or other modules' columns). `pii`
 * (the caller holds `users:pii`) adds the phone number.
 */
export function toAdminUserDto(user: UserRowLike, options: { pii?: boolean } = {}): AdminUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar ?? null,
    ...(options.pii ? { phone: user.phone ?? null } : {}),
    emailVerifiedAt: isoDate(user.emailVerifiedAt),
    lastLoginAt: isoDate(user.lastLoginAt),
    createdAt: isoDate(user.createdAt),
  }
}

/** The signed-in user's own profile, as the self-service routes return it. */
export function toProfileDto(user: Pick<UserRowLike, 'name' | 'email' | 'avatar' | 'phone' | 'locale' | 'emailVerifiedAt'> & { id: number | string }): ProfileDto {
  return {
    id: Number(user.id),
    name: user.name,
    email: user.email,
    avatar: user.avatar ?? null,
    phone: user.phone ?? null,
    locale: user.locale ?? null,
    emailVerifiedAt: isoDate(user.emailVerifiedAt),
  }
}
