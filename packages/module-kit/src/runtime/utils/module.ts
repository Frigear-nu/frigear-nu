import type { Nuxt } from '@nuxt/schema'
import type {} from '../../schema'

export const registerModule = (moduleName: string, nuxt: Nuxt) => {
  nuxt.options.moduleKit ||= {}

  const registeredModules = Array.isArray(nuxt.options.moduleKit._modules)
    ? nuxt.options.moduleKit._modules
    : []

  nuxt.options.moduleKit._modules = registeredModules

  if (!registeredModules.includes(moduleName)) {
    registeredModules.push(moduleName)
  }
}
