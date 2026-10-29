import { z } from 'zod'

// Body schemas shared by the users routes. Kept out of `server/utils` so they are not auto-imported into the host app.

/** An email as it is stored: trimmed and lowercased before it is validated. */
export const emailField = () => z.string().trim().toLowerCase().email().max(254)

/** A display name. */
export const nameField = () => z.string().trim().min(1).max(120)

/** An avatar: an absolute http(s) URL, or `null` to clear it. */
export const avatarField = () => z.string().trim().max(2048).url()
  .refine(value => /^https?:$/.test(new URL(value).protocol), { message: 'The avatar must be an http(s) URL.' })
  .nullable()
