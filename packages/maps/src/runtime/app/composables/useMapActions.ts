import type { DropdownMenuItem } from '@nuxt/ui'
import MapFormSlideover from '../components/MapFormSlideover.vue'
import MapUnderlaySlideover from '../components/MapUnderlaySlideover.vue'
import { mapsApi } from '../../utils/api'
import type { AdminMapDto, OwnerRef } from '../../../types'
import { $fetch, navigateTo, useAction, useConfirmDialog, useMapLinks, useMapsTranslate, useModuleT, useOverlay } from '#imports'

export type MapMenuOptions = {
  /** Runs after the map was deleted (refresh a list, leave the map page). */
  onRemoved?: () => unknown
  /** Runs after the map was edited or got a floor plan. */
  onChanged?: () => unknown
  /** Leave out "Open", e.g. on the map's own page. Defaults to `true`. */
  open?: boolean
}

/**
 * What staff can do with a map, shared by the list, the map page and an operation's "Maps" tab: `create` (a slideover;
 * resolves with the new map, navigating to it unless `navigate: false`), `edit`, `uploadUnderlay` (plane maps),
 * `removeUnderlay`, `remove` (confirms first) and `menu(map)`, the row menu in the same order everywhere:
 * Open, View | Edit, Upload floor plan | Delete.
 */
export function useMapActions() {
  const t = useModuleT('maps')
  const tr = useMapsTranslate()
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()
  const links = useMapLinks()

  async function create(options: { owner?: OwnerRef, navigate?: boolean } = {}): Promise<AdminMapDto | false> {
    const created = await overlay.create(MapFormSlideover, { destroyOnClose: true, props: { owner: options.owner } }).open() as AdminMapDto | false
    if (!created) return false
    const to = links.adminMap(created.id)
    if (options.navigate !== false && to) await navigateTo(to)
    return created
  }

  async function edit(map: AdminMapDto): Promise<AdminMapDto | false> {
    return await overlay.create(MapFormSlideover, { destroyOnClose: true, props: { map } }).open() as AdminMapDto | false
  }

  async function uploadUnderlay(map: AdminMapDto): Promise<AdminMapDto | false> {
    return await overlay.create(MapUnderlaySlideover, { destroyOnClose: true, props: { map } }).open() as AdminMapDto | false
  }

  async function removeUnderlay(map: AdminMapDto): Promise<boolean> {
    const confirmed = await confirm({
      title: t('admin.removeUnderlayTitle', 'Remove the floor plan of {name}?', { name: tr(map.name) }),
      description: t('admin.removeUnderlayDescription', 'The image is deleted. Drawn features stay where they are.'),
      confirmText: t('admin.removeUnderlayAction', 'Remove floor plan'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      () => $fetch(mapsApi.admin.underlay(map.id), { method: 'DELETE' }).then(() => true),
      { success: t('admin.underlayRemoved', 'Floor plan removed'), error: t('admin.underlayRemoveFailed', 'Could not remove the floor plan') },
    )
    return done === true
  }

  async function remove(map: AdminMapDto): Promise<boolean> {
    const name = tr(map.name)
    const confirmed = await confirm({
      title: t('admin.deleteTitle', 'Delete {name}?', { name }),
      description: map.source === 'code'
        ? t('admin.deleteCodeDescription', 'Its layers, features and floor plan are deleted. The module that created it makes a new, empty one the next time it asks for it.')
        : t('admin.deleteDescription', 'Its layers, features and floor plan are deleted, and links to it from other maps stop working.'),
      confirmText: t('admin.deleteAction', 'Delete map'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      () => $fetch(mapsApi.admin.map(map.id), { method: 'DELETE' }).then(() => true),
      { success: t('admin.deleted', 'Deleted {name}', { name }), error: t('admin.deleteFailed', 'Could not delete the map') },
    )
    return done === true
  }

  function menu(map: AdminMapDto, options: MapMenuOptions = {}): DropdownMenuItem[][] {
    const main: DropdownMenuItem[] = []
    const adminTo = links.adminMap(map.id)
    if (options.open !== false && adminTo) main.push({ label: t('admin.open', 'Open'), icon: 'i-lucide-arrow-right', to: adminTo })
    const viewTo = links.view(map.key ?? map.id)
    if (viewTo) main.push({ label: t('admin.viewMap', 'View map'), icon: 'i-lucide-external-link', to: viewTo, target: '_blank' })
    const edits: DropdownMenuItem[] = [{
      label: t('admin.edit', 'Edit'),
      icon: 'i-lucide-pencil',
      onSelect: async () => {
        if (await edit(map)) await options.onChanged?.()
      },
    }]
    if (map.base === 'plane') {
      edits.push({
        label: map.underlay ? t('admin.replaceUnderlay', 'Replace floor plan') : t('admin.underlayAction', 'Upload floor plan'),
        icon: 'i-lucide-image-up',
        onSelect: async () => {
          if (await uploadUnderlay(map)) await options.onChanged?.()
        },
      })
    }
    const destructive: DropdownMenuItem[] = [{
      label: t('admin.deleteAction', 'Delete map'),
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: async () => {
        if (await remove(map)) await options.onRemoved?.()
      },
    }]
    return [main, edits, destructive].filter(group => group.length)
  }

  return { create, edit, uploadUnderlay, removeUnderlay, remove, menu }
}
