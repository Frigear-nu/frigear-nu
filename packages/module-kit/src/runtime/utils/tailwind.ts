import type { Nuxt } from '@nuxt/schema'

const sourcesByNuxt = new WeakMap<Nuxt, Set<string>>()
const wrapped = new WeakSet<object>()

/**
 * Makes Tailwind scan a module's runtime folder (usually `./runtime/app`) for utility classes.
 *
 * Tailwind only scans the host app and the Nuxt layers, so classes used in a module's components, pages or
 * layouts would otherwise never be generated. `@source` is only honoured in the CSS root, and the one root the app
 * always has is the `ui.css` that `@nuxt/ui` generates (imported through `@import "@nuxt/ui"`), so the source is
 * appended there. No setup is needed in the app. Does nothing when `@nuxt/ui` is not installed.
 */
export const registerTailwindSource = (nuxt: Nuxt, dir: string) => {
  const sources = sourcesByNuxt.get(nuxt) ?? new Set<string>()
  sources.add(dir)
  if (sourcesByNuxt.has(nuxt)) {
    return
  }
  sourcesByNuxt.set(nuxt, sources)

  nuxt.hook('app:templates', (app) => {
    const template = app.templates.find(entry => entry.filename === 'ui.css')
    if (!template?.getContents || wrapped.has(template)) {
      return
    }
    wrapped.add(template)
    const getContents = template.getContents
    template.getContents = async (data) => {
      const contents = await getContents(data)
      return `${contents}\n${[...sources].map(source => `@source ${JSON.stringify(source)};`).join('\n')}\n`
    }
  })
}
