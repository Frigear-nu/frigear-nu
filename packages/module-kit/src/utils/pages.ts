import {extendPages} from '@nuxt/kit'
import type {NuxtPage} from '@nuxt/schema'
// this could possibly be imported from the consuming app, but that would require it to also be loaded when it runs this...
// e.g on `modules:done`
import { moduleUrl } from "../runtime/utils/url.ts";

export const defineModulePage = (moduleName: string, page: NuxtPage): NuxtPage => {
  return {
    ...page,
    meta: {
      moduleName,
      ...page.meta,
    },
  }
}

export const extendModulePages = (
  moduleName: string,
  handler: (pages: NuxtPage[]) => NuxtPage[]
) => {
return extendPages((nuxtPages) => {
  const eligiblePages = nuxtPages.filter(p => p.meta?.moduleName === moduleName)
  nuxtPages.push(...handler(eligiblePages).map((page) => {
    return {
      ...page,
      // Module pages ALWAYS get their prefix injected.
      path: moduleUrl(moduleName, page.path),
      meta: {
        moduleName,
        ...page.meta,
      },
    }
  }))
})
}


