import type { Translated } from '@frigear-nu/ui/translated'
import { operationMapKey, OPERATIONS_SITE_KIND, OPERATIONS_VENUE_KIND } from '../../maps'
import { operationsAccess } from '../../access'

// Added only when `@frigear-nu/maps` is installed (`module.ts`). Gives every operation its two maps and lets the
// operation's coordinators draw on them. Without maps this file is not in the build.

/** `name` with a suffix per language: a plain string gets both, a translated name gets the suffix of each language. */
function operationMapName(name: Translated, suffix: { da: string, en: string }): Translated {
  if (typeof name === 'string') return { da: `${name} – ${suffix.da}`, en: `${name} – ${suffix.en}` }
  return Object.fromEntries(Object.entries(name).map(([locale, text]) => [locale, `${text} – ${locale === 'da' ? suffix.da : suffix.en}`]))
}

export default defineNitroPlugin((nitro) => {
  // One site map and one venue layout per operation. `ensureMap` is idempotent by key, so a repeated hook (or a map
  // staff made first) is left alone. Failing to make a map never fails the operation that was just created.
  nitro.hooks.hook('operations:created', async ({ event, operation }) => {
    const owner = { type: 'operation', id: operation.id }
    try {
      await ensureMap(event, {
        key: operationMapKey(operation.id, 'site'),
        kind: OPERATIONS_SITE_KIND,
        owner,
        name: operation.name,
      })
      await ensureMap(event, {
        key: operationMapKey(operation.id, 'venue'),
        kind: OPERATIONS_VENUE_KIND,
        owner,
        name: operationMapName(operation.name, { da: 'Plantegning', en: 'Venue layout' }),
      })
    }
    catch (error) {
      console.error(`[operations] could not create the maps of ${operation.id}`, error)
    }
  })

  // The coordinators (and staff) who manage operations may draw on the maps the operation owns. The caller's own
  // permission is asked (`allows`), so a token that was not given `operations:manage` cannot edit through this listener.
  nitro.hooks.hook('maps:edit:resolve', async (ctx) => {
    if (ctx.map.ownerType !== 'operation' || !ctx.map.ownerId) return
    if (await allows(ctx.event, operationsAccess.permissions.manage)) ctx.allowed = true
  })
})
