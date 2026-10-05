import type { Nuxt } from '@nuxt/schema'
import type { Resolver } from '@nuxt/kit'
import type { NavigationFile } from '../../types'

export type { NavigationItem, NavigationFile } from '../../types'

/**
 * A typed identity helper for authoring a module's `runtime/navigation.ts` file. It exists purely
 * for type inference/DX - it returns the function unchanged.
 *
 * ```ts
 * // runtime/navigation.ts
 * export default defineNavigationFile((items) => {
 *   items.push({ title: 'Profile', to: '/account/profile' })
 *
 *   // Belongs to a nested group instead - created automatically if it doesn't exist yet.
 *   extendNavigationItem('account.menu', { title: 'Security', to: '/account/security' })
 * })
 * ```
 */
export const defineNavigationFile = (file: NavigationFile): NavigationFile => file

type RegisterNavigationFileOptions = {
  resolver: Resolver
  file: string
}

/**
 * Registers a module's navigation file so `@frigear-nu/navigation` picks it up and runs it on the
 * client, alongside every other registered module's navigation file. Modules call this once
 * during their own `setup()` - registration order doesn't matter, since the list is only read
 * once every module has finished setting up (on the `modules:done` hook).
 *
 * ```ts
 * registerNavigationFile(nuxt, {
 *   resolver: createResolver(import.meta.url),
 *   file: './runtime/navigation',
 * })
 * ```
 */
export const registerNavigationFile = async (nuxt: Nuxt, options: RegisterNavigationFileOptions) => {
  nuxt.options.navigation ||= {}

  const files: string[] = Array.isArray(nuxt.options.navigation._files) ? nuxt.options.navigation._files : []
  nuxt.options.navigation._files = files

  const resolved = await options.resolver.resolvePath(options.file)
  if (!files.includes(resolved)) files.push(resolved)
}
