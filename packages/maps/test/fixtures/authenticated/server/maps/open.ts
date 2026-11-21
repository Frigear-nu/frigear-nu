import type { MapFeatureCollection } from '../../../../../src/types'

// A provider layer without a permission: whoever may read the map sees it.
export default (): MapFeatureCollection => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[12.07, 55.61], [12.08, 55.62]] }, properties: { name: 'Route' } }],
})
