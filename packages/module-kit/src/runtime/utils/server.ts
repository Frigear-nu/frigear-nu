import { addServerHandler } from '@nuxt/kit'
import { moduleApiUrl } from './url'
import type { Nuxt } from "@nuxt/schema";

export const addModuleServerRoute = (
  moduleName: string,
  route: string,
  handler: Omit<Parameters<typeof addServerHandler>[0], 'route'>,
) => {
  return addServerHandler({
    ...handler,
    route: moduleApiUrl(moduleName, route),
    meta: {
      moduleName,
    } as never,
  })
}


type DbExtenderFn = (props: { dialect: string, paths: string[] })=> Promise<void>
export const extendDatabaseSchema = async (
  nuxt: Nuxt,
  extender: DbExtenderFn,
  ) => {
  return nuxt.hook('hub:db:schema:extend', extender)
}
