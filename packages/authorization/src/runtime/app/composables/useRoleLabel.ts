import { useNuxtApp } from '#imports'

/**
 * How a role's name reads: its i18n key (`labelKey`, in any namespace) through `@nuxtjs/i18n` when the host has it, else
 * the configured label. Needs nothing but i18n, so the `role` grant field (registered without the admin) uses it too.
 */
export function useRoleLabel() {
  const i18n = useNuxtApp().$i18n as { t: (key: string) => string, te?: (key: string) => boolean } | undefined
  /** `key` through `@nuxtjs/i18n` when the host has it, else `fallback`. */
  const translated = (key: string | null | undefined, fallback: string) => key && i18n?.te?.(key) ? i18n.t(key) : fallback
  /** A role's label: its i18n key when it has one, else the configured label. */
  const roleLabel = (role: { label: string, labelKey?: string | null }) => translated(role.labelKey, role.label)
  return { translated, roleLabel }
}
