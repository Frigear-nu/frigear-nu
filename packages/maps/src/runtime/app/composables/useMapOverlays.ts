import { canvasBase, isPlacedLayout } from '../../utils/georeference'
import type { MapViewerOverlay, PlaneFeatureCollection, PlaneGeoreference, PlanePlacement } from '../../../types'
import { computed, ref } from '#imports'

type ViewerProps = {
  layout?: PlaneFeatureCollection | null
  placement?: PlanePlacement | null
  overlays?: MapViewerOverlay[]
  surface?: string
  params?: Record<string, string | number | null | undefined>
}

/**
 * What the viewers share about overlays: the canvas base (`plane` or `geo`), the overlays that can be drawn (placed
 * plane layouts and `geo` layouts, never on a plane), their toggles, and which surface the live layers come from.
 *
 * The viewer's own `surface` wins. Without it, the first drawn overlay with a `surface` lends its live layers, placed
 * through its georeference; a placed plane layout shown on tiles places its own surface's live layers the same way.
 */
export function useMapOverlays(props: ViewerProps) {
  const base = computed(() => canvasBase(props.layout, props.placement))
  const overlays = computed(() => base.value === 'geo'
    ? (props.overlays ?? []).filter(overlay => isPlacedLayout(overlay.layout, overlay.placement))
    : [])
  const hiddenOverlays = ref<string[]>([])

  function toggleOverlay(id: string, visible?: boolean) {
    const show = visible ?? hiddenOverlays.value.includes(id)
    hiddenOverlays.value = show ? hiddenOverlays.value.filter(other => other !== id) : [...new Set([...hiddenOverlays.value, id])]
  }

  const live = computed<{ surface?: string, params?: ViewerProps['params'], georeference: PlaneGeoreference | null }>(() => {
    const ownGeoreference = base.value === 'geo' && props.layout && props.layout.crs !== 'geo' ? props.placement?.georeference ?? null : null
    if (props.surface) return { surface: props.surface, params: props.params, georeference: ownGeoreference }
    const lender = overlays.value.find(overlay => overlay.surface && !hiddenOverlays.value.includes(overlay.id))
    if (!lender) return { georeference: null }
    return { surface: lender.surface, params: lender.params, georeference: lender.layout.crs === 'geo' ? null : lender.placement?.georeference ?? null }
  })

  return { base, overlays, hiddenOverlays, toggleOverlay, live }
}
