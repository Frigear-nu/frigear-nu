import { addServerHandler } from '@nuxt/kit'
import { moduleApiUrl } from './url'

export type ModuleServerHandler = Parameters<typeof addServerHandler>[0]['handler']

export const addModuleServerRoute = (
  moduleName: string,
  route: string,
  handler: ModuleServerHandler,
) => {
  return addServerHandler({
    handler,
    route: moduleApiUrl(moduleName, route),
    meta: {
      moduleName,
    } as never,
  })
}
