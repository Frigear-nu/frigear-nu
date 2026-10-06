import { computed, unref } from 'vue'
import { useAsyncData, useNuxtApp, useRuntimeConfig } from '#imports'
import { parseMenuPath, sortByOrder } from '../../utils/menu'
import { menus } from '../utils/state'
import type { MenuItem } from '../../../types'
import type { AsyncData, NuxtError } from 'nuxt/app'

// `@nuxtjs/i18n` is optional, so we avoid a hard dependency on its types/composables and instead
// duck-type the `$i18n` plugin it injects when the consuming app installs and configures it -
// mirroring the convention used by `@frigear-nu/base`'s `useContentLocale` (without depending on
// that layer, since the dependency direction is layer -> menus, never the other way around).
type LocaleAwareNuxtApp = ReturnType<typeof useNuxtApp> & {
  $i18n?: { locale: { value: string } }
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

async function loadContentItems(menu: string, group: string, locale: string | undefined): Promise<MenuItem[]> {
  const config = (useRuntimeConfig().public.menus ?? {}) as MenusPublicConfig
  const source = config.content?.[menu]
  if (!source) return []

  // `@nuxt/content`'s `queryCollection` is only available once the module is installed - this
  // branch is only ever reached when it is (see the build-time check in `module.ts`).
  const collection = localizedCollectionName(source.collection, locale)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- `queryCollection` is globally auto-imported by `@nuxt/content`, an optional peer.
  const entry = await queryCollection(collection).first()
  const items = ((entry as Record<string, unknown> | null)?.[source.field] as MenuItem[] | undefined) ?? []

  return items.filter(item => (item.group ?? '') === group)
}

/**
 * Reads a menu's (or menu group's) items, merged from every configured source - items registered
 * at build time through `extendMenu`, items pushed by a module's `runtime/menus.ts` source, and
 * (when enabled) the `@nuxt/content`-backed source - sorted by `order` (ascending, undefined
 * last, in registration order).
 *
 * Addressed as `menu` (root group) or `menu.group` (parsed on the first dot only, e.g.
 * `'dashboard.more'` reads group `more` of menu `dashboard`). Re-evaluates when the content
 * locale changes, and returns the same shape as `useAsyncData` (`{ data, pending, error, refresh }`).
 *
 * ```ts
 * const { data: items } = useMenu('main')
 * const { data: more } = useMenu('dashboard.more')
 * ```
 */
export const useMenu = (path: string): AsyncData<MenuItem[], NuxtError<unknown> | undefined> => {
  const { menu, group } = parseMenuPath(path)
  const locale = useMenuLocale()
  const nuxtApp = useNuxtApp()

  return useAsyncData(
    () => `menu:${menu}.${group}:${locale.value ?? ''}`,
    async () => {
      const registered = menus[menu]?.[group] ?? []
      const content = await loadContentItems(menu, group, unref(locale))
      const result = sortByOrder([...content, ...registered])
      // Fired once a menu's items have been resolved and are about to be handed to a view -
      // useful for analytics/telemetry hooking into when a menu actually becomes visible.
      await nuxtApp.callHook('menus:visible', menu)
      return result
    },
    { watch: [locale] },
  )
}
