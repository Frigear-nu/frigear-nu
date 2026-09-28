import type { Nuxt } from '@nuxt/schema'

type DbExtenderFn = (props: { dialect: string, paths: string[] }) => Promise<void>
export const extendDatabaseSchema = async (
  nuxt: Nuxt,
  extender: DbExtenderFn,
) => {
  return nuxt.hook('hub:db:schema:extend', extender)
}
