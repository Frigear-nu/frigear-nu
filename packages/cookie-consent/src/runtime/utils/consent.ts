import type { ConsentCategory, ConsentState } from '../../types'

export const DEFAULT_CATEGORIES: ConsentCategory[] = [
  {
    key: 'necessary',
    required: true,
    label: { en: 'Necessary', da: 'Nødvendige' },
    description: {
      en: 'Required for the site to work, such as keeping you signed in. Cannot be disabled.',
      da: 'Påkrævet for at siden fungerer, f.eks. at holde dig logget ind. Kan ikke slås fra.',
    },
  },
  {
    key: 'analytics',
    label: { en: 'Analytics', da: 'Statistik' },
    description: {
      en: 'Helps us understand how the site is used so we can improve it.',
      da: 'Hjælper os med at forstå, hvordan siden bruges, så vi kan forbedre den.',
    },
  },
  {
    key: 'marketing',
    label: { en: 'Marketing', da: 'Markedsføring' },
    description: {
      en: 'Used for social media integrations and relevant content.',
      da: 'Bruges til integration med sociale medier og relevant indhold.',
    },
  },
]

/** Merges categories by key: earlier labels win, cookies are concatenated, `required` is sticky. */
export function mergeCategories(...lists: ConsentCategory[][]): ConsentCategory[] {
  const byKey = new Map<string, ConsentCategory>()
  for (const category of lists.flat()) {
    const existing = byKey.get(category.key)
    if (!existing) {
      byKey.set(category.key, { ...category, cookies: [...(category.cookies ?? [])] })
      continue
    }
    existing.required = existing.required || category.required
    existing.defaultEnabled = existing.defaultEnabled ?? category.defaultEnabled
    existing.label = existing.label ?? category.label
    existing.description = existing.description ?? category.description
    const known = new Set((existing.cookies ?? []).map(cookie => cookie.name))
    existing.cookies = [...(existing.cookies ?? []), ...(category.cookies ?? []).filter(cookie => !known.has(cookie.name))]
  }
  return [...byKey.values()]
}

/** Small stable string hash (djb2) - used to derive the consent version from the category set. */
export function hashString(input: string): string {
  let hash = 5381
  for (let index = 0; index < input.length; index++) {
    hash = ((hash << 5) + hash + input.charCodeAt(index)) | 0
  }
  return (hash >>> 0).toString(36)
}

export function computeVersion(manualVersion: string | undefined, categories: ConsentCategory[]): string {
  const fingerprint = categories
    .map(category => `${category.key}:${category.required ? 1 : 0}:${(category.cookies ?? []).map(cookie => cookie.name).sort().join(',')}`)
    .sort()
    .join('|')
  return `${manualVersion ?? '1'}-${hashString(fingerprint)}`
}

/** Builds a state: required categories are always granted, unknown keys are dropped. */
export function buildConsent(categories: ConsentCategory[], version: string, choices: Record<string, boolean>, now = Date.now()): ConsentState {
  return {
    v: version,
    ts: now,
    categories: Object.fromEntries(
      categories.map(category => [category.key, category.required ? true : choices[category.key] === true]),
    ),
  }
}

export function acceptAllChoices(categories: ConsentCategory[]): Record<string, boolean> {
  return Object.fromEntries(categories.map(category => [category.key, true]))
}

export function rejectAllChoices(categories: ConsentCategory[]): Record<string, boolean> {
  return Object.fromEntries(categories.map(category => [category.key, !!category.required]))
}

/**
 * Turns whatever the cookie holds into a valid state for the *current* version, or `null` when the
 * visitor must be asked again (nothing stored, malformed, or made against another version).
 * The old app's `accepted` / `rejected` strings are migrated.
 */
export function normalizeConsent(raw: unknown, categories: ConsentCategory[], version: string, now = Date.now()): ConsentState | null {
  if (raw === 'accepted') return buildConsent(categories, version, acceptAllChoices(categories), now)
  if (raw === 'rejected') return buildConsent(categories, version, rejectAllChoices(categories), now)
  if (!raw || typeof raw !== 'object') return null

  const state = raw as Partial<ConsentState>
  if (state.v !== version || typeof state.ts !== 'number' || !state.categories || typeof state.categories !== 'object') return null

  return buildConsent(categories, version, state.categories, state.ts)
}

export function localize(value: string | Record<string, string> | undefined, locale: string, fallback = ''): string {
  if (!value) return fallback
  if (typeof value === 'string') return value
  return value[locale] ?? value[locale.split('-')[0]!] ?? value.en ?? Object.values(value)[0] ?? fallback
}
