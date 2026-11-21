import type { MapLiveFeatureCollection } from '../../../../../src/runtime/utils'

// The `demo.crowd` live layer: a module's own route, returning GeoJSON in the units of the surface (plane units here).
export default defineEventHandler((): MapLiveFeatureCollection => ({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', id: 'bar', geometry: { type: 'Point', coordinates: [250, 700] }, properties: { label: 'Bar queue', count: 14 } },
    { type: 'Feature', id: 'stage', geometry: { type: 'Point', coordinates: [700, 300] }, properties: { label: 'Stage front', count: 82 } },
  ],
}))
