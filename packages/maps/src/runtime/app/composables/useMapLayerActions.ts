import type { DropdownMenuItem } from '@nuxt/ui'
import MapLayerSlideover from '../components/MapLayerSlideover.vue'
import { mapsApi } from '../../utils/api'
import type { AdminMapLayerDto } from '../../../types'
import { $fetch, useAction, useConfirmDialog, useMapsTranslate, useModuleT, useOverlay } from '#imports'

/**
 * What staff can do with a map's stored layers: `create`, `edit` (slideovers resolving with the saved layer or
 * `false`), `remove` (confirms first, saying how many features go with it) and `menu(layer)`: Edit | Delete.
 */
export function useMapLayerActions(mapId: () => string) {
  const t = useModuleT('maps')
  const tr = useMapsTranslate()
  const overlay = useOverlay()
  const confirm = useConfirmDialog()
  const { run } = useAction()

  async function create(): Promise<AdminMapLayerDto | false> {
    return await overlay.create(MapLayerSlideover, { destroyOnClose: true, props: { mapId: mapId() } }).open() as AdminMapLayerDto | false
  }

  async function edit(layer: AdminMapLayerDto): Promise<AdminMapLayerDto | false> {
    return await overlay.create(MapLayerSlideover, { destroyOnClose: true, props: { mapId: mapId(), layer } }).open() as AdminMapLayerDto | false
  }

  async function remove(layer: AdminMapLayerDto & { featureCount?: number }): Promise<boolean> {
    const name = tr(layer.name) || layer.key
    const confirmed = await confirm({
      title: t('admin.deleteLayerTitle', 'Delete {name}?', { name }),
      description: t('admin.deleteLayerDescription', 'The layer and its {count} features are deleted.', { count: layer.featureCount ?? 0 }),
      confirmText: t('admin.deleteLayer', 'Delete layer'),
      destructive: true,
    })
    if (!confirmed) return false
    const done = await run(
      () => $fetch(mapsApi.admin.layer(mapId(), layer.id), { method: 'DELETE' }).then(() => true),
      { success: t('admin.deleted', 'Deleted {name}', { name }), error: t('admin.deleteLayerFailed', 'Could not delete the layer') },
    )
    return done === true
  }

  function menu(layer: AdminMapLayerDto & { featureCount?: number }, options: { onChanged?: () => unknown } = {}): DropdownMenuItem[][] {
    return [
      [{
        label: t('admin.edit', 'Edit'),
        icon: 'i-lucide-pencil',
        onSelect: async () => {
          if (await edit(layer)) await options.onChanged?.()
        },
      }],
      [{
        label: t('admin.deleteLayer', 'Delete layer'),
        icon: 'i-lucide-trash-2',
        color: 'error',
        onSelect: async () => {
          if (await remove(layer)) await options.onChanged?.()
        },
      }],
    ]
  }

  return { create, edit, remove, menu }
}
