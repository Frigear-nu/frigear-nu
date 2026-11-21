// What `#maps/server-registry` holds in the unit tests: a seat kind with a properties schema, and the built-in area.
import { z } from 'zod'
import area from '../src/runtime/properties/area'
import type { MapFeatureKindInfo } from '../src/types'

export const kinds: Record<string, MapFeatureKindInfo> = {
  'seating.seat': { id: 'seating.seat', label: 'Seat', icon: null, geometry: ['Point'], color: null, hasProperties: true, hasComponent: false },
  'maps.area': { id: 'maps.area', label: 'Area', icon: null, geometry: ['Polygon'], color: null, hasProperties: true, hasComponent: false },
}

export const layers = {}

export const propertySchemas = {
  'seating.seat': z.object({ row: z.string().max(4), number: z.number().int().min(1), accessible: z.boolean().default(false) }),
  'maps.area': area,
}
