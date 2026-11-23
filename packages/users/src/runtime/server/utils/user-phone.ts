import { USER_PHONE_MAX_LENGTH, USER_PHONE_PATTERN } from '../../utils/phone'

/**
 * A phone number as `users.phone` stores it (the rule of the users routes: trimmed, at most 40 digits, spaces and
 * `+-().`), or `null` when `value` is not a string, is empty or breaks the rule. For modules that write `users.phone`
 * from their own input, such as an application form.
 */
export function parseUserPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const phone = value.trim()
  if (!phone || phone.length > USER_PHONE_MAX_LENGTH || !USER_PHONE_PATTERN.test(phone)) return null
  return phone
}
