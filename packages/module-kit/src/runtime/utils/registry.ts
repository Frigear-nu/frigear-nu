import { addServerTemplate, addTemplate } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

export interface VirtualRegistryOptions<T> {
  /** Template file name, for example `#widgets/registry.mjs`. */
  filename: string
  /** `app` writes the template and aliases it (`alias`); `server` adds a Nitro virtual module named `filename`. Defaults to `app`. */
  target?: 'app' | 'server'
  /** The import path of the virtual module (`app` target only), for example `#widgets/registry`. */
  alias?: string
  /** Reads what modules registered during their own `setup()`. Called once every module is done. */
  collect: () => T
  /** The source of the virtual module. */
  contents: (data: T) => string
  /** Called with the collected data after the template is registered, for hosts that want to inspect it. */
  resolved?: (data: T) => void | Promise<void>
}

/**
 * The "registry" pattern of the frigear modules: other modules register entries in any order during their `setup()`,
 * and once all modules are done the collected entries are bundled into one virtual module the runtime imports (no
 * runtime scanning, Workers friendly). Call it from the owning module's `setup()`.
 */
export function defineVirtualRegistry<T>(nuxt: Nuxt, options: VirtualRegistryOptions<T>) {
  nuxt.hook('modules:done', async () => {
    const data = options.collect()
    const getContents = () => options.contents(data)

    if (options.target === 'server') {
      addServerTemplate({ filename: options.filename, getContents })
    }
    else {
      const template = addTemplate({ filename: options.filename, write: true, getContents })
      if (options.alias) nuxt.options.alias[options.alias] = template.dst
    }

    await options.resolved?.(data)
  })
}
