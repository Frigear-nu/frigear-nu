import { addServerHandler } from '@nuxt/kit'
import { moduleApiUrl } from './url'

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
