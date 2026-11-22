import { fileURLToPath } from 'node:url'
import { buildNuxt, loadNuxt } from '@nuxt/kit'
import { describe, expect, it } from 'vitest'

// The client plugins in the order the app runs them, read from the generated `plugins.client.mjs` of a fixture with
// `@nuxtjs/i18n`. `nuxt prepare` only (no bundle, no server), so it adds no e2e boot time.
async function clientPlugins(rootDir: string) {
  const nuxt = await loadNuxt({ cwd: rootDir, dev: false, overrides: { _prepare: true } })
  let source = ''
  nuxt.hook('app:templatesGenerated', () => {
    const key = Object.keys(nuxt.vfs).find(path => path.endsWith('/plugins.client.mjs'))
    source = key ? nuxt.vfs[key]! : ''
  })
  try {
    await buildNuxt(nuxt)
    return {
      plugins: source.split('\n').filter(line => line.startsWith('import ')).map(line => line.replace(/^import \S+ from /, '')),
      locales: (nuxt.options.runtimeConfig.users as { locales: string[] }).locales,
    }
  }
  finally {
    await nuxt.close()
  }
}

describe('remember-locale plugin with @nuxtjs/i18n', () => {
  it('runs after i18n:plugin, so $i18n is there when it sets up, and knows the app\'s locales', async () => {
    const { plugins, locales } = await clientPlugins(fileURLToPath(new URL('./fixtures/locale-i18n', import.meta.url)))
    const i18nPlugin = plugins.findIndex(src => src.includes('@nuxtjs/i18n/dist/runtime/plugins/i18n.'))
    const rememberLocale = plugins.findIndex(src => src.includes('plugins/remember-locale.client'))
    expect(i18nPlugin).toBeGreaterThan(-1)
    expect(rememberLocale).toBeGreaterThan(i18nPlugin)
    expect(locales).toEqual(['en', 'da'])
  }, 120_000)
})
