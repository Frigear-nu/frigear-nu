import type { MapRow } from './utils/maps'

// The record rules of maps (registered with `addPolicies` in `module.ts`). A policy only narrows: signed-in users hold
// `maps:read` and `maps:edit` implicitly, these decide which maps that covers.
export default [
  // A map is readable when its visibility lets the viewer in (`isVisible` of `@frigear-nu/audience`, with the viewer
  // resolved once per request), and always for staff with `maps:manage`.
  definePolicy<MapRow>('maps:read', async ({ event, record }) => {
    if (!record) return undefined
    if (isMapPublic(record)) return true
    // Without a record, so this check does not run the record policies again.
    if (await allows(event, 'maps:manage')) return true
    return mapsVisibleTo(record.visibility, await resolveMapsViewer(event))
  }),
  // `maps:manage`, the kind's `editPermission`, or an owner module answering `maps:edit:resolve`.
  definePolicy<MapRow>('maps:edit', async ({ event, user, record }) => {
    if (!record) return undefined
    return mapsCanEdit(event, user as { id: string | number }, record)
  }),
]
