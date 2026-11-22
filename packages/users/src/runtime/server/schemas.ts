import { z } from 'zod'
import { USER_PHONE_MAX_LENGTH, USER_PHONE_PATTERN } from '../utils/phone'
import { USER_LOCALE_MAX_LENGTH, normalizeUserLocale } from '../utils/locale'

// Body schemas shared by the users routes. Kept out of `server/utils` so they are not auto-imported into the host app.

/** An email as it is stored: trimmed and lowercased before it is validated. */
export const emailField = () => z.string().trim().toLowerCase().email().max(254)

/** A display name. */
export const nameField = () => z.string().trim().min(1).max(120)

/** An avatar: an absolute http(s) URL, or `null` to clear it. */
export const avatarField = () => z.string().trim().max(2048).url()
  .refine(value => /^https?:$/.test(new URL(value).protocol), { message: 'The avatar must be an http(s) URL.' })
  .nullable()

/**
 * A phone number as it is stored: trimmed, at most 40 characters of digits, spaces and `+-().`, or `null` to clear it.
 * An empty string clears it too.
 */
export const phoneField = () => z.string().trim().max(USER_PHONE_MAX_LENGTH)
  .regex(USER_PHONE_PATTERN, { message: 'Enter a phone number of digits, spaces and + - ( ).' })
  .transform(value => value || null)
  .nullable()

/**
 * A language as it is stored (`normalizeUserLocale`): one of `known` (the app's i18n locale codes) when there are any,
 * else a short BCP-47 tag; or `null` to clear it. An empty string clears it too.
 */
export const localeField = (known: readonly string[] = []) => z.string().trim().max(USER_LOCALE_MAX_LENGTH)
  .refine(value => !value || normalizeUserLocale(value, known) !== null, {
    message: known.length ? `Choose one of: ${known.join(', ')}.` : 'Enter a language tag such as "da" or "en-GB".',
  })
  .transform(value => normalizeUserLocale(value, known))
  .nullable()
