import type { MapLocation, PlaneFeatureCollection } from '../../../src/runtime/utils'

// Starting values of the playground: a location with an area and a small venue layout.
export const demoLocation = (): MapLocation => ({
  point: { lat: 10.002, lng: 20.004 },
  area: [
    { lat: 10.004, lng: 20.000 },
    { lat: 10.004, lng: 20.008 },
    { lat: 10.000, lng: 20.008 },
    { lat: 10.000, lng: 20.000 },
  ],
})

export const demoLayout = (): PlaneFeatureCollection => ({
  type: 'FeatureCollection',
  extent: { width: 1000, height: 800 },
  features: [
    { type: 'Feature', id: 'stage', kind: 'maps.area', label: { da: 'Scene', en: 'Stage' }, geometry: { type: 'Polygon', coordinates: [[[550, 150], [900, 150], [900, 450], [550, 450], [550, 150]]] }, properties: { color: 'info' } },
    { type: 'Feature', id: 'bar', kind: 'maps.area', label: { da: 'Bar', en: 'Bar' }, geometry: { type: 'Polygon', coordinates: [[[100, 600], [400, 600], [400, 750], [100, 750], [100, 600]]] }, properties: { color: 'warning' } },
    { type: 'Feature', id: 'entrance', kind: 'maps.label', label: { da: 'Indgang', en: 'Entrance' }, geometry: { type: 'Point', coordinates: [500, 40] }, properties: { size: 'large' } },
    ...[0, 1, 2, 3, 4].map(index => ({
      type: 'Feature' as const,
      id: `seat-a${index + 1}`,
      kind: 'demo.seat',
      label: `A${index + 1}`,
      geometry: { type: 'Point' as const, coordinates: [150 + index * 50, 300] as [number, number] },
      properties: { row: 'A', number: index + 1, accessible: index === 0 },
    })),
  ],
})
