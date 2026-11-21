import {
  addComponentsDir,
  addImports,
  addServerImportsDir,
  addServerPlugin,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  hasNuxtModule,
} from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import {
  addModulePages,
  addModuleRoutes,
  addOptionalMenuSource,
  defineVirtualRegistry,
  inlineModuleRuntime,
  registerDatabaseTable,
  registerLocales,
  registerModule,
  registerTailwindSource,
  resolvePagePath,
} from '@frigear-nu/module-kit/utils'
import { addPolicies, registerAccess } from '@frigear-nu/auth/utils'
import { mapsAccess } from './runtime/access'
import { buildMapsRegistry } from './runtime/utils/registry'
import type { BuiltMapsRegistry } from './runtime/utils/registry'
import { MAX_UNDERLAY_BYTES } from './runtime/utils/image'
import type {
  MapFeatureContext,
  MapFeatureUpdatedContext,
  MapsEditResolveContext,
  MapsExtension,
  MapsSeedResolveContext,
  MapTilesOptions,
  ModuleOptions,
  PublicModuleOptions,
} from './types'

export type * from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    maps?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    maps: PublicModuleOptions
  }
}

declare module 'nitropack' {
  interface NitroRuntimeHooks {
    /** Push map definitions into `maps` (called once, on the first request); maps creates the missing ones with `ensureMap`. */
    'maps:seed:resolve': (ctx: MapsSeedResolveContext) => void | Promise<void>
    /** Set `allowed = true` to let `user` edit `map` (owner modules: a team's leads, an operation's coordinators). */
    'maps:edit:resolve': (ctx: MapsEditResolveContext) => void | Promise<void>
    /** A feature was drawn on a map. */
    'maps:feature:created': (ctx: MapFeatureContext) => void | Promise<void>
    /** A feature changed; `previous` is the feature before. */
    'maps:feature:updated': (ctx: MapFeatureUpdatedContext) => void | Promise<void>
    /** A feature was removed. */
    'maps:feature:deleted': (ctx: MapFeatureContext) => void | Promise<void>
  }
}

const MODULE_NAME = '@frigear-nu/maps'

/** OpenStreetMap's public tiles: fine for development and light use, not for a festival's worth of phones. */
export const OSM_TILES: Required<MapTilesOptions> = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}

type MapsInNuxt = ModuleOptions & { _extensions?: MapsExtension[] }

/** The built-in kinds and feature kinds: generic geo and plane maps with markers, lines, areas and labels. */
function builtInExtension(resolve: (path: string) => string): MapsExtension {
  return {
    featureKinds: [
      { id: 'maps.marker', label: { da: 'Markør', en: 'Marker' }, icon: 'i-lucide-map-pin', geometry: 'Point', properties: resolve('./runtime/properties/marker') },
      { id: 'maps.line', label: { da: 'Linje', en: 'Line' }, icon: 'i-lucide-route', geometry: 'LineString', properties: resolve('./runtime/properties/line') },
      { id: 'maps.area', label: { da: 'Område', en: 'Area' }, icon: 'i-lucide-pentagon', geometry: 'Polygon', properties: resolve('./runtime/properties/area') },
      { id: 'maps.label', label: { da: 'Tekst', en: 'Label' }, icon: 'i-lucide-type', geometry: 'Point', properties: resolve('./runtime/properties/label') },
    ],
    kinds: [
      {
        id: 'maps.generic-geo',
        label: { da: 'Kort', en: 'Map' },
        base: 'geo',
        featureKinds: ['maps.marker', 'maps.line', 'maps.area', 'maps.label'],
        editorTools: ['marker', 'polyline', 'polygon', 'rectangle', 'text'],
      },
      {
        id: 'maps.generic-plane',
        label: { da: 'Plantegning', en: 'Floor plan' },
        base: 'plane',
        featureKinds: ['maps.marker', 'maps.line', 'maps.area', 'maps.label'],
        editorTools: ['marker', 'polyline', 'polygon', 'rectangle', 'text', 'snapGrid'],
      },
    ],
  }
}

/** The app registry: JSON plus lazy imports of the property schemas and components (never the providers). */
function appRegistryTemplate(registry: BuiltMapsRegistry): string {
  const lines = [`import { defineAsyncComponent } from 'vue'`]
  lines.push(`export const kinds = ${JSON.stringify(registry.kinds)}`)
  lines.push(`export const featureKinds = ${JSON.stringify(registry.featureKinds)}`)
  lines.push(`export const layers = ${JSON.stringify(registry.layers)}`)
  const lazy = (entries: Record<string, string>, wrap: (path: string) => string) =>
    `{${Object.entries(entries).map(([id, path]) => `\n  ${JSON.stringify(id)}: ${wrap(JSON.stringify(path))}`).join(',')}\n}`
  lines.push(`export const propertySchemas = ${lazy(registry.propertyFiles, path => `() => import(${path}).then(m => m.default)`)}`)
  lines.push(`export const featureComponents = ${lazy(registry.featureComponents, path => `defineAsyncComponent(() => import(${path}))`)}`)
  lines.push(`export const layerComponents = ${lazy(registry.layerComponents, path => `defineAsyncComponent(() => import(${path}))`)}`)
  return `${lines.join('\n')}\n`
}

/** The server registry: JSON plus the property schemas and the providers, imported statically. */
function serverRegistryTemplate(registry: BuiltMapsRegistry): string {
  const lines: string[] = []
  const schemaIds = Object.keys(registry.propertyFiles)
  const providerKeys = Object.keys(registry.providerFiles)
  schemaIds.forEach((id, index) => lines.push(`import schema${index} from ${JSON.stringify(registry.propertyFiles[id])}`))
  providerKeys.forEach((key, index) => lines.push(`import provider${index} from ${JSON.stringify(registry.providerFiles[key])}`))
  lines.push(`export const kinds = ${JSON.stringify(registry.kinds)}`)
  lines.push(`export const featureKinds = ${JSON.stringify(registry.featureKinds)}`)
  lines.push(`export const layers = ${JSON.stringify(registry.layers)}`)
  lines.push(`export const propertySchemas = {${schemaIds.map((id, index) => `${JSON.stringify(id)}: schema${index}`).join(', ')}}`)
  lines.push(`export const providers = {${providerKeys.map((key, index) => `${JSON.stringify(key)}: provider${index}`).join(', ')}}`)
  return `${lines.join('\n')}\n`
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'maps' },
  defaults: {
    settings: { pages: {} },
  },
  moduleDependencies: {
    '@nuxthub/core': { version: '>=0.10', defaults: { blob: true } },
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/auth': { version: '>=0.0.1' },
    '@frigear-nu/ui': { version: '>=0.0.1' },
    '@frigear-nu/menu': { version: '>=0.0.1', optional: true },
    '@frigear-nu/widget': { version: '>=0.0.0', optional: true },
    // Provides the admin route and shell the admin pages live in; the page components come from `@frigear-nu/ui`.
    '@frigear-nu/admin': { version: '>=0.0.0', optional: true },
  },
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    // `maps:read`, `maps:edit`, `maps:manage` and the `maps` scope (`runtime/access.ts`).
    registerAccess(nuxt, mapsAccess, { from: MODULE_NAME })
    // The record rules of `maps:read` (visibility) and `maps:edit` (staff, the kind's permission, `maps:edit:resolve`).
    addPolicies(nuxt, { path: resolver.resolve('./runtime/server/policies') })
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))
    const settings = options.settings ?? {}

    // The read-only map page is on unless `pages.view` is `false`; the admin pages are opt-in and need Admin.
    const viewPath = resolvePagePath(settings.pages?.view ?? true, '/maps/:map')
    let adminPath: string | undefined
    let adminMapPath: string | undefined
    if (hasNuxtModule('@frigear-nu/admin')) {
      const { adminRoute } = await import('@frigear-nu/admin/utils')
      adminPath = resolvePagePath(settings.pages?.admin, adminRoute(nuxt, 'maps'))
      adminMapPath = resolvePagePath(settings.pages?.adminMap, adminRoute(nuxt, 'maps', ':id'))
    }

    const tiles: Required<MapTilesOptions> = { ...OSM_TILES, ...options.tiles, maxZoom: options.tiles?.maxZoom ?? OSM_TILES.maxZoom }
    nuxt.options.runtimeConfig.public.maps = {
      pages: { view: viewPath, admin: adminPath, adminMap: adminMapPath },
      tiles,
      maxUnderlayBytes: settings.maxUnderlayBytes ?? MAX_UNDERLAY_BYTES,
    }

    // --- Registry ---------------------------------------------------------------------------------------------------
    // Built-in kinds first, then every module's `extendMaps` (in module order), then the host's own option: a later
    // definition with the same id replaces an earlier one. Read once every module is done; an invalid definition fails
    // the build.
    let built: BuiltMapsRegistry | undefined
    const registryOf = (): BuiltMapsRegistry => {
      if (built) return built
      const stash = (nuxt.options as unknown as { maps?: MapsInNuxt }).maps?._extensions ?? []
      const { registry, issues } = buildMapsRegistry([
        builtInExtension(path => resolver.resolve(path)),
        ...stash,
        { kinds: options.kinds, featureKinds: options.featureKinds, layers: options.layers },
      ])
      if (issues.length) throw new Error(`[${MODULE_NAME}] Invalid map registrations:\n- ${issues.join('\n- ')}`)
      built = registry
      return registry
    }
    nuxt.hook('modules:done', () => {
      registryOf()
    })
    defineVirtualRegistry(nuxt, {
      filename: 'maps/registry.mjs',
      alias: '#maps/registry',
      collect: registryOf,
      contents: appRegistryTemplate,
    })
    defineVirtualRegistry(nuxt, {
      filename: '#maps/server-registry',
      target: 'server',
      collect: registryOf,
      contents: serverRegistryTemplate,
    })
    const types = JSON.stringify(resolver.resolve('./types'))
    addTypeTemplate({
      filename: 'types/maps-registry.d.ts',
      getContents: () => `declare module '#maps/registry' {
  import type { Component } from 'vue'
  import type { MapFeatureKindInfo, MapKindInfo, MapLayerInfo } from ${types}
  export const kinds: Record<string, MapKindInfo>
  export const featureKinds: Record<string, MapFeatureKindInfo>
  export const layers: Record<string, MapLayerInfo>
  export const propertySchemas: Record<string, () => Promise<unknown>>
  export const featureComponents: Record<string, Component>
  export const layerComponents: Record<string, Component>
}
declare module '#maps/server-registry' {
  import type { H3Event } from 'h3'
  import type { MapDto, MapFeatureCollection, MapFeatureKindInfo, MapKindInfo, MapLayerInfo } from ${types}
  export type MapsPropertySchema = { safeParse: (value: unknown) => { success: true, data: unknown } | { success: false, error: { issues: Array<{ path: PropertyKey[], message: string }> } } }
  export type MapsProvider = (event: H3Event, map: MapDto) => MapFeatureCollection | Promise<MapFeatureCollection>
  export const kinds: Record<string, MapKindInfo>
  export const featureKinds: Record<string, MapFeatureKindInfo>
  export const layers: Record<string, MapLayerInfo>
  export const propertySchemas: Record<string, MapsPropertySchema>
  export const providers: Record<string, MapsProvider>
}
`,
    }, { nitro: true, nuxt: true })

    // --- Database ---------------------------------------------------------------------------------------------------
    registerDatabaseTable(nuxt, {
      resolver,
      schema: dialect => `./runtime/server/db/schema.${dialect}`,
    })

    // --- API routes -------------------------------------------------------------------------------------------------
    // `:map` is a map's id or key; each segment has its own param name.
    addModuleRoutes(resolver, [
      { method: 'get', path: '', file: 'maps.get' },
      { method: 'get', path: ':map', file: 'map.get' },
      { method: 'get', path: ':map/layers/:layerKey', file: 'layer.get' },
      { method: 'get', path: ':map/underlay', file: 'underlay.get' },
      { method: 'post', path: ':map/features', file: 'features.post' },
      { method: 'patch', path: ':map/features/:featureId', file: 'feature.patch' },
      { method: 'delete', path: ':map/features/:featureId', file: 'feature.delete' },
    ], { base: '/api/maps' })

    addModuleRoutes(resolver, [
      { method: 'get', path: '', file: 'admin/maps.get' },
      { method: 'post', path: '', file: 'admin/maps.post' },
      { method: 'get', path: ':id', file: 'admin/map.get' },
      { method: 'patch', path: ':id', file: 'admin/map.patch' },
      { method: 'delete', path: ':id', file: 'admin/map.delete' },
      { method: 'post', path: ':id/layers', file: 'admin/layers.post' },
      { method: 'patch', path: ':id/layers/:layerId', file: 'admin/layer.patch' },
      { method: 'delete', path: ':id/layers/:layerId', file: 'admin/layer.delete' },
      { method: 'post', path: ':id/underlay', file: 'admin/underlay.post' },
      { method: 'delete', path: ':id/underlay', file: 'admin/underlay.delete' },
    ], { base: '/api/admin/maps' })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)
    // Creates the maps `maps:seed:resolve` listeners ask for, on the first request.
    addServerPlugin(resolver.resolve('./runtime/server/plugins/seed'))

    // --- App runtime ------------------------------------------------------------------------------------------------
    addImports([
      { name: 'useMap', from: resolver.resolve('./runtime/app/composables/useMap') },
      { name: 'useMapActions', from: resolver.resolve('./runtime/app/composables/useMapActions') },
      { name: 'useMapLayerActions', from: resolver.resolve('./runtime/app/composables/useMapLayerActions') },
      { name: 'useMapsTranslate', from: resolver.resolve('./runtime/app/composables/useMapsTranslate') },
      { name: 'useMapLinks', from: resolver.resolve('./runtime/app/composables/useMapLinks') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })

    addModulePages(MODULE_NAME, resolver, [
      { name: 'maps-view', path: viewPath, file: './runtime/app/pages/view.vue' },
      { name: 'maps-admin', path: adminPath, file: './runtime/app/pages/admin.vue' },
      { name: 'maps-admin-map', path: adminMapPath, file: './runtime/app/pages/admin-map.vue' },
    ])

    // A "Maps" tab on the staff operation page (`admin.operations`, owned by `@frigear-nu/operations`), without
    // importing operations: a tab for an area nobody renders is harmless.
    if (adminMapPath && settings.operationsTab !== false && hasNuxtModule('@frigear-nu/widget')) {
      await addOperationsTab(nuxt, resolver.resolve('./runtime/app/tabs/OwnerMaps.vue'))
    }

    addOptionalMenuSource(nuxt, { file: resolver.resolve('./runtime/menus'), menu: 'admin.nav' })
  },
})

async function addOperationsTab(nuxt: Nuxt, component: string) {
  const { extendTabs } = await import('@frigear-nu/widget/utils')
  extendTabs(nuxt, 'admin.operations', {
    id: 'maps',
    component,
    order: 40,
    label: 'Maps',
    labelKey: 'maps.admin.tabs.maps',
    icon: 'i-lucide-map',
    props: { ownerType: 'operation' },
    permission: mapsAccess.permissions.manage,
  })
}
