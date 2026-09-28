import { existsSync } from 'node:fs'
import { joinURL } from 'ufo'

/**
 * Checks if the consuming app defines its own `index.vue` page.
 * When true, the app is expected to own landing/locale-root routing itself,
 * so the layer should not rewrite the index page's route.
 */
export function landingPageExists(rootDir: string): boolean {
  const indexPagePath = joinURL(rootDir, 'app', 'pages', 'index.vue')
  return existsSync(indexPagePath)
}
