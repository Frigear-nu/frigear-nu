import { type MenuItem, type ParsedMenuPath, collectMenuItems, matchesMenuGroup, parseMenuPath, sortByOrder } from '../utils/menu'
import type { H3Event } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

export const useMenu = async (event: H3Event, path: string) => {
  const parsed = parseMenuPath(path)
  const { menu } = parsed

  const config = useRuntimeConfig(event)
  const menus = config.public.menus
  const registered = collectMenuItems(menus[menu as keyof typeof menus] as Record<string, MenuItem[]> | undefined, parsed)
  const content = await loadContentItems(menu, parsed, '')
  const result = sortByOrder([...registered, ...content])
  // Fired once a menu's items have been resolved and are about to be handed to a view -
  // useful for analytics/telemetry hooking into when a menu actually becomes visible.
  // await nitro.hooks.callHook('menus:visible', menu)
  return result
}

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
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- `queryCollection` is globally auto-imported by `@nuxt/content`, an optional peer.
  const entry = await queryCollection(collection).first()
  const items = ((entry as Record<string, unknown> | null)?.[source.field] as MenuItem[] | undefined) ?? []

  return items.filter((item) => {
    const group = item.group ?? ''
    return parsed.wildcard ? matchesMenuGroup(group, parsed.group) : group === parsed.group
  })
}
