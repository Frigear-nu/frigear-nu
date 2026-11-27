import { addComponentsDir, addImports, addServerImportsDir, addTypeTemplate, createResolver, defineNuxtModule } from '@nuxt/kit'
import { defineVirtualRegistry, inlineModuleRuntime, registerLocales, registerModule, registerTailwindSource, isClientOnlyApp, serverModuleDependencies } from '@frigear-nu/module-kit/utils'
import { buildMapsRegistry } from './runtime/utils/registry'
import type { BuiltMapsRegistry } from './runtime/utils/registry'
import { MAX_UNDERLAY_BYTES } from './runtime/utils/image'
import { DEFAULT_GEO_CENTER } from './runtime/utils/geo'
import type { MapsExtension, MapTilesOptions, ModuleOptions, PublicModuleOptions } from './types'

export type * from './types'

declare module '@nuxt/schema' {
  interface NuxtConfig {
    maps?: ModuleOptions
  }

  interface PublicRuntimeConfig {
    maps: PublicModuleOptions
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

/** The built-in feature kinds: markers, lines, areas and labels, for layouts no module gave kinds of its own. */
function builtInExtension(resolve: (path: string) => string): MapsExtension {
  return {
    kinds: [
      { id: 'maps.marker', label: { da: 'Markør', en: 'Marker' }, icon: 'i-lucide-map-pin', geometry: 'Point', properties: resolve('./runtime/properties/marker') },
      { id: 'maps.line', label: { da: 'Linje', en: 'Line' }, icon: 'i-lucide-route', geometry: 'LineString', properties: resolve('./runtime/properties/line') },
      { id: 'maps.area', label: { da: 'Område', en: 'Area' }, icon: 'i-lucide-pentagon', geometry: 'Polygon', properties: resolve('./runtime/properties/area') },
      { id: 'maps.label', label: { da: 'Tekst', en: 'Label' }, icon: 'i-lucide-type', geometry: 'Point', properties: resolve('./runtime/properties/label') },
    ],
  }
}

/** The app registry: JSON plus lazy imports of the property schemas and the kinds' components. */
function appRegistryTemplate(registry: BuiltMapsRegistry): string {
  const lines = [`import { defineAsyncComponent } from 'vue'`]
  lines.push(`export const kinds = ${JSON.stringify(registry.kinds)}`)
  lines.push(`export const layers = ${JSON.stringify(registry.layers)}`)
  const lazy = (entries: Record<string, string>, wrap: (path: string) => string) =>
    `{${Object.entries(entries).map(([id, path]) => `\n  ${JSON.stringify(id)}: ${wrap(JSON.stringify(path))}`).join(',')}\n}`
  lines.push(`export const propertySchemas = ${lazy(registry.propertyFiles, path => `() => import(${path}).then(m => m.default)`)}`)
  lines.push(`export const kindComponents = ${lazy(registry.kindComponents, path => `defineAsyncComponent(() => import(${path}))`)}`)
  return `${lines.join('\n')}\n`
}

/** The server registry: JSON plus the property schemas, imported statically (`validatePlaneLayout`). */
function serverRegistryTemplate(registry: BuiltMapsRegistry): string {
  const ids = Object.keys(registry.propertyFiles)
  const lines = ids.map((id, index) => `import schema${index} from ${JSON.stringify(registry.propertyFiles[id])}`)
  lines.push(`export const kinds = ${JSON.stringify(registry.kinds)}`)
  lines.push(`export const layers = ${JSON.stringify(registry.layers)}`)
  lines.push(`export const propertySchemas = {${ids.map((id, index) => `${JSON.stringify(id)}: schema${index}`).join(', ')}}`)
  return `${lines.join('\n')}\n`
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: MODULE_NAME, configKey: 'maps' },
  moduleDependencies: nuxt => ({
    // Blob holds underlay images (`storeMapUnderlay`); maps itself has no tables.
    ...serverModuleDependencies(nuxt, { '@nuxthub/core': { version: '>=0.10', defaults: { blob: true } } }),
    '@frigear-nu/module-kit': { version: '>=0.0.1' },
    '@frigear-nu/ui': { version: '>=0.0.1' },
  }),
  async setup(options, nuxt) {
    registerModule(MODULE_NAME, nuxt)
    const resolver = createResolver(import.meta.url)
    registerTailwindSource(nuxt, resolver.resolve('./runtime/app'))
    registerLocales(nuxt, resolver.resolve('./runtime/i18n/lang'))

    const tiles: Required<MapTilesOptions> = { ...OSM_TILES, ...options.tiles, maxZoom: options.tiles?.maxZoom ?? OSM_TILES.maxZoom }
    nuxt.options.runtimeConfig.public.maps = {
      tiles,
      defaultCenter: options.defaultCenter ?? DEFAULT_GEO_CENTER,
      maxUnderlayBytes: options.maxUnderlayBytes ?? MAX_UNDERLAY_BYTES,
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
        { kinds: options.kinds, layers: options.layers },
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
  import type { MapFeatureKindInfo, MapLayerInfo } from ${types}
  export const kinds: Record<string, MapFeatureKindInfo>
  export const layers: Record<string, MapLayerInfo>
  export const propertySchemas: Record<string, () => Promise<unknown>>
  export const kindComponents: Record<string, Component>
}
declare module '#maps/server-registry' {
  import type { MapFeatureKindInfo, MapLayerInfo } from ${types}
  export type MapsPropertySchema = { safeParse: (value: unknown) => { success: true, data: unknown } | { success: false, error: { issues: Array<{ path: PropertyKey[], message: string }> } } }
  export const kinds: Record<string, MapFeatureKindInfo>
  export const layers: Record<string, MapLayerInfo>
  export const propertySchemas: Record<string, MapsPropertySchema>
}
`,
    }, { nitro: true, nuxt: true })

    // --- Server: helpers for the routes of the modules that store maps values ---------------------------------------
    // A client-only app (`isClientOnlyApp`, e.g. a mobile app) has no such routes.
    if (!isClientOnlyApp(nuxt)) addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    inlineModuleRuntime(nuxt, resolver)

    // --- App: components that work on props and v-model only ---------------------------------------------------------
    addImports([
      { name: 'useMapsTranslate', from: resolver.resolve('./runtime/app/composables/useMapsTranslate') },
      { name: 'useMapLiveLayers', from: resolver.resolve('./runtime/app/composables/useMapLiveLayers') },
    ])
    addComponentsDir({ path: resolver.resolve('./runtime/app/components') })
  },
})
