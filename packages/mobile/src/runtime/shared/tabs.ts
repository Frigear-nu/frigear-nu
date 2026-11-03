import type { MobileTab, MobileTabDefinition } from '../../types'

// Pure tab logic shared by the build (validation, `#mobile/tabs`) and the app (selected tab, titles).

const ID = /^[a-z0-9][\w.-]*$/i

/** Whether `path` matches `pattern`: exact, or `/foo/**` for `/foo` and everything below it. */
export function matchesPath(pattern: string, path: string): boolean {
  const clean = (value: string) => (value.length > 1 ? value.replace(/\/+$/, '') : value) || '/'
  if (pattern.endsWith('/**')) {
    const base = clean(pattern.slice(0, -3) || '/')
    const target = clean(path)
    return base === '/' || target === base || target.startsWith(`${base}/`)
  }
  return clean(pattern) === clean(path)
}

/** The default `match` of a tab: its page and everything below it, or only `/` for the home tab. */
export function defaultTabMatch(to: string): string[] {
  const path = to.split(/[?#]/)[0] || '/'
  return path === '/' ? ['/'] : [path, `${path.replace(/\/+$/, '')}/**`]
}

export interface NormalizedTabs {
  tabs: MobileTab[]
  /** Problems that make the tabs unusable (the build fails). */
  errors: string[]
  /** Problems worth a warning. */
  warnings: string[]
}

/**
 * Validates and orders tab definitions: unique, well-formed ids, a `to` path, an icon. Later definitions with the same
 * id replace earlier ones in place (a host overrides a module's tab). Sorted by `order`, then registration.
 */
export function normalizeTabs(definitions: MobileTabDefinition[], options: { auth: boolean, nativeIcons?: boolean }): NormalizedTabs {
  const errors: string[] = []
  const warnings: string[] = []
  const byId = new Map<string, { definition: MobileTabDefinition, index: number }>()

  definitions.forEach((definition, index) => {
    if (!definition || typeof definition !== 'object') {
      errors.push(`Tab #${index + 1} is not an object.`)
      return
    }
    if (typeof definition.id !== 'string' || !ID.test(definition.id)) {
      errors.push(`Tab #${index + 1} has an invalid id ${JSON.stringify(definition.id)} (letters, digits, "-", "_" and ".").`)
      return
    }
    const existing = byId.get(definition.id)
    byId.set(definition.id, { definition: { ...existing?.definition, ...definition }, index: existing?.index ?? index })
  })

  const tabs: (MobileTab & { index: number })[] = []
  for (const { definition, index } of byId.values()) {
    const { match, requiresAuth, ...rest } = definition
    if (typeof definition.to !== 'string' || !definition.to.startsWith('/')) {
      errors.push(`Tab "${definition.id}" needs a \`to\` path starting with "/".`)
      continue
    }
    if (!definition.label) errors.push(`Tab "${definition.id}" needs a \`label\`.`)
    if (!definition.icon) errors.push(`Tab "${definition.id}" needs an \`icon\` (e.g. "i-lucide-house").`)
    if (options.nativeIcons && !definition.sfSymbol) {
      warnings.push(`Tab "${definition.id}" has no \`sfSymbol\`: the native iOS tab bar shows it without an icon.`)
    }
    tabs.push({
      ...rest,
      match: match === undefined ? defaultTabMatch(definition.to) : [match].flat(),
      requiresAuth: requiresAuth ?? options.auth,
      index,
    })
  }

  const paths = new Map<string, string>()
  for (const tab of tabs) {
    const other = paths.get(tab.to)
    if (other) warnings.push(`Tabs "${other}" and "${tab.id}" both open ${tab.to}.`)
    else paths.set(tab.to, tab.id)
  }
  if (tabs.length > 5) {
    warnings.push(`${tabs.length} tabs: iOS shows at most 5 in the tab bar (the rest go behind "More"), and the web tab bar gets crowded.`)
  }

  const sorted = tabs
    .sort((a, b) => (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) || a.index - b.index)
    .map(({ index: _index, ...tab }) => tab)
  return { tabs: sorted, errors, warnings }
}

/**
 * The tab to select on `path`: the one named by the page (`definePageMeta({ mobile: { tab } })`), else the one whose
 * `match` fits most specifically (`/bills/**` wins over `/**`).
 */
export function findActiveTab<T extends Pick<MobileTab, 'id' | 'match'>>(tabs: T[], path: string, preferredId?: string): T | undefined {
  if (preferredId) {
    const preferred = tabs.find(tab => tab.id === preferredId)
    if (preferred) return preferred
  }
  let best: { tab: T, score: number } | undefined
  for (const tab of tabs) {
    for (const pattern of tab.match) {
      if (!matchesPath(pattern, path)) continue
      // Exact patterns beat wildcards; longer bases beat shorter ones.
      const score = pattern.endsWith('/**') ? pattern.length - 3 : pattern.length + 1000
      if (!best || score > best.score) best = { tab, score }
    }
  }
  return best?.tab
}

/** Whether `path` is the tab's own page (where it has no back button and a large title). */
export function isTabRoot(tab: Pick<MobileTab, 'to'> | undefined, path: string): boolean {
  return !!tab && matchesPath(tab.to.split(/[?#]/)[0] || '/', path)
}

/** Whether every tab's `to` is a page of the app. Returns the tabs that are not. */
export function findTabsWithoutPage(tabs: Pick<MobileTab, 'id' | 'to'>[], pagePaths: string[]): string[] {
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Vue Router paths: `:id()` / `:id` one segment, `:id?` an optional one, `:slug(.*)*` any rest.
  const toPattern = (path: string) => new RegExp(`^${path.split('/').filter(Boolean).map((segment) => {
    if (/^:\w+\(\.\*\)\*$/.test(segment)) return '(?:/.*)?'
    if (/^:\w+(?:\(\))?\?$/.test(segment)) return '(?:/[^/]+)?'
    return `/${segment.split(/(:\w+(?:\(\))?)/).map(part => (part.startsWith(':') ? '[^/]+' : escape(part))).join('')}`
  }).join('') || '/'}/?$`)
  const patterns = pagePaths.map(toPattern)
  return tabs.filter((tab) => {
    const path = tab.to.split(/[?#]/)[0] || '/'
    return !patterns.some(pattern => pattern.test(path))
  }).map(tab => tab.id)
}
