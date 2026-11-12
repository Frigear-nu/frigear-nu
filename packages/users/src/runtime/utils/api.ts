// Typed paths of the module's HTTP routes, for app code, tests and docs (no string literals elsewhere).
// Also published as `@frigear-nu/users/api`: unlike `@frigear-nu/users/utils` (which carries the build-time
// `extendUsersAdmin`), it is safe to import from another module's app code.
import type { AdminUserDto, ProfileDto } from '../../types'

export type { AdminUserDto, ProfileDto }

const base = '/api/users'
const adminBase = '/api/admin/users'

/** The users API: self-service under `/api/users`, staff under `/api/admin/users`. */
export const usersApi = {
  me: {
    /** `PATCH { name, avatar? }`: updates the caller's profile, answers the profile DTO. `profile:write` (implicit). */
    profile: `${base}/me`,
    /** `PUT { email }`: changes the caller's email (or emails a confirmation link with `verifyEmailChange`). Session only. */
    email: `${base}/me/email`,
    /** `PUT { currentPassword, newPassword, confirmNewPassword }`: changes the caller's password. Session only. */
    password: `${base}/me/password`,
  },
  /** `GET ?code=`: read-only preview of an email change link (`verifyEmailChange`). */
  emailChange: `${base}/email-change`,
  /** `POST { code }`: confirms an email change; the signed-in owner only. */
  emailChangeConfirm: `${base}/email-change/confirm`,
  /** `GET ?code=` (preview) and `POST { code }` (restore the old address). The code is the proof, no sign-in needed. */
  emailChangeRevert: `${base}/email-change/revert`,
  admin: {
    /** `GET` (paginated list, `users:list`; `useTableQuery` keys plus `role`, `verified`) and `POST` (create, `users:create`, 201). */
    users: adminBase,
    /** `GET` (detail), `PATCH` (edit) and `DELETE` (204). */
    user: (id: number | string) => `${adminBase}/${encodeURIComponent(String(id))}`,
    /** `POST`: emails the sign-in link (or the verification email) again. */
    resend: (id: number | string) => `${adminBase}/${encodeURIComponent(String(id))}/resend`,
    /** `GET`: the newest sign-ups of the last 30 days (dashboard). */
    new: `${adminBase}/new`,
    /** `GET`: `{ total, newUsers, days }` (dashboard). */
    stats: `${adminBase}/stats`,
  },
} as const
