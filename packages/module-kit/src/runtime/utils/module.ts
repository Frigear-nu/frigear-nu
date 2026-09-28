import type { Nuxt } from "@nuxt/schema";

export const registerModule = (moduleName: string, nuxt: Nuxt) => {
  nuxt.options.moduleKit ||= {};
  nuxt.options.moduleKit._modules ||= [];
  if (!nuxt.options.moduleKit._modules.includes(moduleName)) {
    nuxt.options.moduleKit._modules.push(moduleName);
  }
}
