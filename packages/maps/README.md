# @frigear-nu/maps

Maps for Frigear apps: a festival site map on map tiles, or a bar layout drawn on a floor plan. Any owner (an operation,
a team, the platform) can have maps; staff draw on them in the browser, volunteers look at them on the web and in the
app. Other modules ship their own kinds of maps, feature kinds, live layers and map pages without changing this one.

```bash
pnpm add @frigear-nu/maps @frigear-nu/audience
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/users', '@frigear-nu/maps'],
  hub: { db: 'sqlite', blob: true },
  maps: { settings: { pages: { admin: true, adminMap: true } } },
})
```

| Export | What it does |
| --- | --- |
| `<MapView map>`, `<MapEditor map>`, `useMap(keyOrId)` | A read-only map, the editor (leaflet-geoman, limited to the kind's tools), and the composable for custom map pages. |
| `extendMaps`, `defineMapKind`, `defineMapFeatureKind`, `defineMapLayer` (`@frigear-nu/maps/utils`) | Register map kinds, feature kinds (with a zod properties schema) and provider layers from a module's `setup()`. |
| `ensureMap(event, definition)` (server util) | Creates a map from code once, idempotent by key. |
| `translatedProperty` (`@frigear-nu/maps/properties`) | A translated text in a feature kind's properties schema. |
| `mapsApi` (`@frigear-nu/maps/api`) | Typed paths of the HTTP API. |

The default tiles are OpenStreetMap's public tile server, which forbids heavy use: set `maps.tiles` to a hosted tile
provider in production.

Full reference: [docs.frigear.dev/modules/volunteering/maps](https://docs.frigear.dev/modules/volunteering/maps).
