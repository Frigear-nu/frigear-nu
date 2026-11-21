# @frigear-nu/maps

Maps as a building block for other modules. A module that needs a place (where an operation is) or a layout (the bars,
stations and seats of a venue) stores the value in its own table, edits it with these components on its own pages, and
saves it through its own routes. Maps has no tables, routes or admin pages of its own.

```bash
pnpm add @frigear-nu/maps
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/maps'],
  hub: { blob: true },
})
```

| Export | What it does |
| --- | --- |
| `<MapLocationField v-model>` | A location picker on OpenStreetMap tiles: a point, with a radius or an area. |
| `<MapPlaneEditor v-model :kinds :upload>` | A plane layout editor (leaflet-geoman): underlay image, grid snapping, allowed feature kinds, a properties form per kind. |
| `<MapViewer>`, `<MapMobileViewer>` | Read-only viewers for the web and for mobile screens, with live layers. |
| `extendMaps`, `defineMapFeatureKind`, `defineMapLayer` (`@frigear-nu/maps/utils`) | Register feature kinds and live layers from a module's `setup()`. |
| `mapLocationSchema`, `planeFeatureCollectionSchema` (`@frigear-nu/maps/schemas`) | zod schemas of the stored values. |
| `haversineMeters`, `isInLocation`, `geometryAnchor`, ... (`@frigear-nu/maps/utils`) | Geometry helpers. |
| `validatePlaneLayout`, `storeMapUnderlay`, `serveMapUnderlay` (server utils) | Check a layout against the registered kinds; store and serve underlay images in NuxtHub Blob. |
| `translatedProperty` (`@frigear-nu/maps/properties`) | A translated text in a feature kind's properties schema. |

The default tiles are OpenStreetMap's public tile server, which forbids heavy use: set `maps.tiles` to a hosted tile
provider in production.

There is no default location: without a value, the picker and viewers open on a world view unless configured. Set
`maps.defaultCenter` (`{ center: [lat, lng], zoom }`) to open them on your own area.

`pnpm --filter @frigear-nu/maps dev` runs the playground: every component with a sample layout, a `demo.seat` kind
and a `demo.crowd` live layer.

Docs: https://docs.frigear.dev/modules/volunteering/maps
