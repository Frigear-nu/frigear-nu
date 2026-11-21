import type { H3Event } from 'h3'
import type { MapDto, MapFeatureCollection } from '../../../../../src/types'

// A provider layer, as shifts would ship it: who is on duty, computed per request. One invalid feature is filtered out
// by maps.
export default function onDuty(_event: H3Event, map: MapDto): MapFeatureCollection {
  const point: [number, number] = map.base === 'plane' ? [100, 200] : [12.08, 55.62]
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', id: 'duty-1', geometry: { type: 'Point', coordinates: point }, properties: { label: { da: 'Anna (BA)', en: 'Anna (BA)' } } },
      { type: 'Feature', id: 'broken', geometry: { type: 'Point', coordinates: ['x', 1] as unknown as [number, number] }, properties: {} },
    ],
  }
}
