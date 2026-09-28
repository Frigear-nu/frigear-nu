import { kebabCase } from 'scule'
import { joinURL } from 'ufo'

// if it starts with a / it is an absolute path, otherwise it is a relative path
export const moduleUrl = (
  moduleName: string,
  path?: string,
) => {
  return joinURL(
    path?.startsWith('/') ? '' : kebabCase(moduleName),
    path ?? '',
  )
}

export const moduleApiUrl = (
  moduleName: string,
  path?: string,
) => {
  return joinURL(
    path?.startsWith('/') ? '' : 'api',
    path?.startsWith('/') ? '' : kebabCase(moduleName),
    path ?? '',
  )
}
