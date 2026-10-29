import { isoDate } from '@frigear-nu/module-kit/server'
import type { AdminUserDto, ProfileDto } from '../../../types'

/** The columns the DTOs read; `role`, `emailVerifiedAt` and `lastLoginAt` come from other modules' extensions. */
type UserRowLike = {
  id: number
  name: string
  email: string
  avatar?: string | null
  role?: string | null
  emailVerifiedAt?: Date | number | string | null
  lastLoginAt?: Date | number | string | null
  createdAt: Date | number | string
}

/** A stored user as the users admin returns it: an allowlist (never the password hash or other modules' columns). */
export function toAdminUserDto(user: UserRowLike): AdminUserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    ...(usersHaveRoles() && user.role ? { role: user.role } : {}),
    avatar: user.avatar ?? null,
    emailVerifiedAt: isoDate(user.emailVerifiedAt),
    lastLoginAt: isoDate(user.lastLoginAt),
    createdAt: isoDate(user.createdAt),
  }
}

/** The signed-in user's own profile, as the self-service routes return it. */
export function toProfileDto(user: Pick<UserRowLike, 'name' | 'email' | 'avatar' | 'emailVerifiedAt'> & { id: number | string }): ProfileDto {
  return {
    id: Number(user.id),
    name: user.name,
    email: user.email,
    avatar: user.avatar ?? null,
    emailVerifiedAt: isoDate(user.emailVerifiedAt),
  }
}
