import { blob } from '@nuxthub/blob'
import { notFound } from '@frigear-nu/module-kit/server'
import { UNDERLAY_TYPES } from '../../utils/image'
import type { UnderlayType } from '../../utils/image'

// The floor plan image of a plane map, for whoever may read the map. Served with the stored type only when it is one
// of the allowed image types, `nosniff`, and inline. The URL carries a version (`?v=`), so it may be cached.
export default defineEventHandler(async (event) => {
  const { map } = await getValidatedRouterParams(event, mapsMapParams.parse)
  const row = await getReadableMapOr404(event, map)
  const underlay = row.underlay
  if (!underlay?.pathname || !(UNDERLAY_TYPES as readonly string[]).includes(underlay.contentType)) throw notFound('This map has no floor plan.')
  const stored = await blob.get(underlay.pathname)
  if (!stored) throw notFound('This map has no floor plan.')
  setResponseHeader(event, 'content-type', underlay.contentType as UnderlayType)
  setResponseHeader(event, 'content-disposition', 'inline')
  setResponseHeader(event, 'x-content-type-options', 'nosniff')
  setResponseHeader(event, 'cache-control', `${isMapPublic(row) ? 'public' : 'private'}, max-age=3600`)
  return stored
})
