import { globSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, setup } from '@nuxt/test-utils/e2e'

const rootDir = fileURLToPath(new URL('./fixtures/spa', import.meta.url))

describe('spa (default)', async () => {
  await setup({ rootDir })

  it('writes capacitor.config.json through nuxt-capacitor', () => {
    const config = JSON.parse(readFileSync(`${rootDir}/capacitor.config.json`, 'utf8'))
    expect(config).toMatchObject({
      appId: 'nu.frigear.Spa',
      appName: 'SPA fixture',
      webDir: '.output/public',
      plugins: { Keyboard: { resize: 'native', resizeOnFullScreen: true } },
    })
    expect(config.server?.url).toBeUndefined()
  })

  it('turns SSR off: the page renders in the client only', async () => {
    const html = await $fetch<string>('/')
    expect(html).not.toContain('spa-home')
    expect(html).toMatch(/<div id="__nuxt"[^>]*><\/div>/)
  })

  it('writes the native manifest for the CLI', () => {
    // `.nuxt/mobile/native.json` in an app; test builds use their own build dir under `.nuxt/test/`.
    const [file] = globSync('.nuxt/**/mobile/native.json', { cwd: rootDir })
      .sort((a, b) => statSync(`${rootDir}/${b}`).mtimeMs - statSync(`${rootDir}/${a}`).mtimeMs)
    expect(file).toBeDefined()
    const manifest = JSON.parse(readFileSync(`${rootDir}/${file}`, 'utf8'))
    // URL schemes are lowercase.
    expect(manifest).toMatchObject({ appId: 'nu.frigear.Spa', schemes: ['nu.frigear.spa'], redirectUri: 'nu.frigear.spa:/auth/callback' })
    expect(manifest.plugins.map((plugin: { name: string }) => plugin.name)).toContain('@capacitor/browser')
  })

  it('installs the OAuth client with the mobile defaults', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('protect:"all"')
    expect(html).toContain('nativeRedirectUri:"nu.frigear.spa:/auth/callback"')
    // Tabs follow the sign-in state.
    expect(html).toMatch(/mobile:\{appId:"nu.frigear.Spa"[^}]*auth:true/)
  })
})
