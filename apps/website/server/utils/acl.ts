import { parseEmailList } from '#shared/acl'

/** The verified addresses that are always admins (`NUXT_ACL_ADMINS`). */
export function aclAdmins(): string[] {
  return parseEmailList(useRuntimeConfig().aclAdmins)
}
