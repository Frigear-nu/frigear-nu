import { describe, expect, it } from 'vitest'
import { globSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Nuxt does not auto-import into a module installed in node_modules, so a helper a module's <template> calls must be
// imported in its <script setup>. In the monorepo the auto-import still works, which hides the bug until an external
// app renders the page (`ReferenceError: __unimport_tableUi is not defined`), and lint's no-undef skips templates.
const nuxtTemplateHelpers = ['navigateTo', 'useRoute', 'useRouter', 'useToast', 'useOverlay', 'useAppConfig', 'useRuntimeConfig', 'useNuxtApp', 'useUserSession', 'refreshNuxtData']
const exportedName = /export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/g

describe('module template imports', () => {
  it('imports every helper a module template calls', () => {
    const root = fileURLToPath(new URL('../../..', import.meta.url))
    const helperFiles = globSync('packages/*/src/runtime/{utils,composables,app/utils,app/composables}/**/*.ts', { cwd: root })
    const helpers = new Set(nuxtTemplateHelpers)
    for (const file of helperFiles) {
      for (const match of readFileSync(`${root}/${file}`, 'utf8').matchAll(exportedName)) helpers.add(match[1]!)
    }
    expect(helpers).toContain('tableUi')

    const files = globSync('packages/*/src/runtime/**/*.vue', { cwd: root })
    expect(files.length).toBeGreaterThan(0)
    const offenders = files.flatMap((file) => {
      const source = readFileSync(`${root}/${file}`, 'utf8')
      const script = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n')
      const template = source.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, '')
      return [...helpers]
        .filter(name => new RegExp(`(?<![\\w$.])${name.replace('$', '\\$')}\\s*\\(`).test(template)
          && !new RegExp(`(?<![\\w$])${name.replace('$', '\\$')}(?![\\w$])`).test(script))
        .map(name => `${file}: ${name}`)
    })
    expect(offenders).toEqual([])
  })
})
