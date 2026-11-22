/** The select value for "no language": Nuxt UI's select does not allow an empty value. */
export const PROFILE_NO_LOCALE = '-'

export interface ProfileFormValues {
  name: string
  avatar: string
  phone: string
  /** A locale code, or {@link PROFILE_NO_LOCALE}. */
  locale: string
}

/**
 * The body of `PATCH /api/users/me` for the profile form. The language is sent only when the app offers a choice
 * (`localeChoice`, with i18n) and the user changed it: a stored language the app no longer offers (or one saved while it
 * had no i18n) is refused by the server, so resending it untouched would block every other change.
 */
export function profileChanges(values: ProfileFormValues, saved: Pick<ProfileFormValues, 'locale'>, options: { localeChoice: boolean }) {
  const localeChanged = options.localeChoice && values.locale !== saved.locale
  return {
    name: values.name,
    avatar: values.avatar || null,
    phone: values.phone || null,
    ...(localeChanged ? { locale: values.locale === PROFILE_NO_LOCALE ? null : values.locale } : {}),
  }
}
