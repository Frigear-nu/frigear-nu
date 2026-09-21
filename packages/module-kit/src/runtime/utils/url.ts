import { kebabCase } from 'scule'
import { joinURL } from 'ufo'

export const moduleUrl = (
  moduleName: string,
  path?: string,
) => {
  return joinURL(kebabCase(moduleName), path ?? '')
}

export const moduleApiUrl = (
  moduleName: string,
  path?: string,
) => {
  return joinURL('api', kebabCase(moduleName), path ?? '')
}
