// Where the two areas of the help center live, and the path builders every link goes through. Framework-free, so
// `module.ts`, server code (sent links), the app and tests share it. Nothing hard-codes `/help` or `/dashboard/help`.

const enc = encodeURIComponent

export const DEFAULT_PUBLIC_PATH = '/help'
/** The signed-in area without the signed-in hub of `@frigear-nu/dashboard`; with it the default is `<hub>/help`. */
export const DEFAULT_SIGNED_IN_PATH = '/account/help'
/** The segment of the signed-in area below the hub: `/dashboard/help`. */
export const HUB_SIGNED_IN_SEGMENT = 'help'

/** The configured bases of the two areas. An area that is off has no base. */
export type HelpCenterAreas = { public?: string, signedIn?: string }

/**
 * A usable base path: starts with a single `/`, has no query, hash, whitespace or empty segment, and is not the site
 * root. A trailing `/` is dropped. Throws a message naming the option, so a typo fails the build.
 */
export function normalizeHelpCenterPath(value: string, option: string): string {
  const path = value.trim().replace(/\/+$/, '')
  if (!path || !path.startsWith('/') || path.startsWith('//') || /[\s?#]/.test(path) || path.includes('//') || path.split('/').some(segment => segment === '.' || segment === '..')) {
    throw new Error(`[@frigear-nu/help-center] \`settings.pages.${option}\` must be a path starting with "/" such as "/help" (got "${value}").`)
  }
  return path
}

/**
 * Turns the `pages` option into the bases of the two areas: a string is a custom path, `false` turns the area off and
 * anything else (omitted, `true`) is the default (`/help`; `defaults.signedIn`, else `/account/help`). The areas cannot
 * share a path or sit inside one another.
 */
export function resolveHelpCenterAreas(pages: { public?: string | boolean, signedIn?: string | boolean } | undefined, defaults: { signedIn?: string } = {}): HelpCenterAreas {
  const one = (setting: string | boolean | undefined, fallback: string, option: string) => {
    if (setting === false) return undefined
    return normalizeHelpCenterPath(typeof setting === 'string' ? setting : fallback, option)
  }
  const areas: HelpCenterAreas = {
    public: one(pages?.public, DEFAULT_PUBLIC_PATH, 'public'),
    signedIn: one(pages?.signedIn, defaults.signedIn || DEFAULT_SIGNED_IN_PATH, 'signedIn'),
  }
  if (areas.public && areas.signedIn && (isPathUnder(areas.public, areas.signedIn) || isPathUnder(areas.signedIn, areas.public))) {
    // Equal, or one below the other: the pages of the outer area (`<base>/:category`) would swallow the inner one's.
    throw new Error(`[@frigear-nu/help-center] \`settings.pages.public\` ("${areas.public}") and \`settings.pages.signedIn\` ("${areas.signedIn}") overlap: the areas need paths of their own, neither inside the other.`)
  }
  return areas
}

/** Whether `path` is `base` or below it. */
export const isPathUnder = (path: string, base: string) => path === base || path.startsWith(`${base}/`)

/** The three page routes of an area, as Nuxt writes them. */
export function helpCenterRoutePatterns(base: string) {
  return { index: base, category: `${base}/:category`, article: `${base}/:category/:slug` }
}

/** The links of one area. Each returns `undefined` when the area is off, so a template can pass it straight to `to`. */
export type HelpAreaPaths = {
  base: string | undefined
  index: () => string | undefined
  category: (category: string) => string | undefined
  article: (category: string, slug: string) => string | undefined
}

function areaPaths(base: string | undefined): HelpAreaPaths {
  return {
    base,
    index: () => base,
    category: category => base ? `${base}/${enc(category)}` : undefined,
    article: (category, slug) => base ? `${base}/${enc(category)}/${enc(slug)}` : undefined,
  }
}

/**
 * The path builders of both areas for the given bases: `helpCenterPaths.public.article('safety', 'first-aid')`,
 * `helpCenterPaths.signedIn.index()`. On a page use `useHelpCenterPaths()`, which reads the configured bases and keeps
 * the locale prefix.
 */
export function createHelpCenterPaths(areas: HelpCenterAreas) {
  return { public: areaPaths(areas.public), signedIn: areaPaths(areas.signedIn) }
}

export type HelpCenterPaths = ReturnType<typeof createHelpCenterPaths>
