import { computed, unref } from 'vue'
import { useAsyncData, useNuxtApp, useRuntimeConfig, useState } from '#imports'
import { queryCollection } from '#menu/optional'
import { type MenuTranslator, type ParsedMenuPath, collectMenuItems, matchesMenuGroup, parseMenuPath, sortByOrder, translateMenuItem } from '../../utils/menu'
import { getAppMenuStore } from '../utils/state'
import type { MenuFilterContext, MenuItem } from '../../../types'
import type { AsyncData, NuxtError } from 'nuxt/app'

/** The `useState` key holding the access version (a number), see `useMenu`. */
export const ACCESS_VERSION_KEY = 'access:version'

// `@nuxtjs/i18n` is optional, so we avoid a hard dependency on its types/composables and instead
// duck-type the `$i18n` plugin it injects when the consuming app installs and configures it -
// mirroring the convention used by `@frigear-nu/base`'s `useContentLocale` (without depending on
// that layer, since the dependency direction is layer -> menus, never the other way around).
type LocaleAwareNuxtApp = ReturnType<typeof useNuxtApp> & {
  $i18n?: { locale: { value: string } } & Partial<MenuTranslator>
}

function useMenuLocale() {
  const nuxtApp = useNuxtApp() as LocaleAwareNuxtApp
  return computed(() => nuxtApp.$i18n?.locale?.value)
}

// Matches the locale-suffixed collection naming convention defined by `@frigear-nu/base`'s
// `content.config.ts` (e.g. `config` -> `config_en` when the app opts into `@nuxtjs/i18n`).
function localizedCollectionName(name: string, locale?: string) {
  return locale ? `${name}_${locale.replace(/-/g, '_')}` : name
}

type MenusPublicConfig = {
  content?: Record<string, { collection: string, field: string } | undefined>
}

async function loadContentItems(menu: string, parsed: ParsedMenuPath, locale: string | undefined): Promise<MenuItem[]> {
  const config = (useRuntimeConfig().public.menus ?? {}) as MenusPublicConfig
  const source = config.content?.[menu]
  if (!source) return []

  // `@nuxt/content`'s `queryCollection` is only available once the module is installed - this
  // branch is only ever reached when it is (see the build-time check in `module.ts`).
  const collection = localizedCollectionName(source.collection, locale)
  const entry = await queryCollection(collection as Parameters<typeof queryCollection>[0]).first()
  const items = ((entry as Record<string, unknown> | null)?.[source.field] as MenuItem[] | undefined) ?? []

  return items.filter((item) => {
    const group = item.group ?? ''
    return parsed.wildcard ? matchesMenuGroup(group, parsed.group) : group === parsed.group
  })
}

/**
 * Reads a menu's (or menu group's) items, merged from every configured source - items registered
 * at build time through `extendMenu`, items pushed by a module's `runtime/menus.ts` source, and
 * (when enabled) the `@nuxt/content`-backed source - sorted by `order` (ascending, undefined
 * last, in registration order).
 *
 * Addressed as `menu` (root group) or `menu.group` (parsed on the first dot only, e.g.
 * `'dashboard.more'` reads group `more` of menu `dashboard`). A path ending in `.*` reads every
 * matching group instead, flattened into a single list: `'dashboard.*'` reads every group of
 * `dashboard`, `'dashboard.account.*'` reads `account` and every group nested under it. Re-evaluates
 * when the content locale changes, and returns the same shape as `useAsyncData` (`{ data, pending,
 * error, refresh }`).
 *
 * ```ts
 * const { data: items } = useMenu('main')
 * const { data: more } = useMenu('dashboard.more')
 * const { data: all } = useMenu('dashboard.*')
 * ```
 */
export const useMenu = (path: string): AsyncData<MenuItem[], NuxtError<unknown> | undefined> => {
  const parsed = parseMenuPath(path)
  const { menu } = parsed
  const locale = useMenuLocale()
  const nuxtApp = useNuxtApp() as LocaleAwareNuxtApp
  // Bumped by whoever knows what the viewer may do (`@frigear-nu/authorization`) whenever that changes (sign-in,
  // sign-out, a role change), so filtered menus are resolved again. Shared through `useState`, so this module has no
  // dependency on the access layer; without one it stays `0`.
  const accessVersion = useState<number>(ACCESS_VERSION_KEY, () => 0)

  return useAsyncData(
    () => `menu:${path}:${locale.value ?? ''}:${accessVersion.value}`,
    async () => {
      const i18n = nuxtApp.$i18n?.t && nuxtApp.$i18n.te ? (nuxtApp.$i18n as MenuTranslator) : undefined
      const registered = collectMenuItems(getAppMenuStore(nuxtApp)[menu], parsed).map(item => translateMenuItem(item, i18n))
      const content = await loadContentItems(menu, parsed, unref(locale))
      // `menus:filter` listeners drop the items the viewer may not see (`item.permission`), children included.
      const ctx: MenuFilterContext = { menu, path, items: sortByOrder([...content, ...registered]) }
      await nuxtApp.callHook('menus:filter', ctx)
      const result = ctx.items
      // Fired once a menu's items have been resolved and are about to be handed to a view -
      // useful for analytics/telemetry hooking into when a menu actually becomes visible.
      await nuxtApp.callHook('menus:visible', menu)
      return result
    },
    { watch: [locale, accessVersion] },
  )
}
