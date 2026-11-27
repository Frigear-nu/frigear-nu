// The disk side of `useCachedFetch`: remembered responses written to a storage the app provides (an unstorage
// `Storage`, such as `@frigear-nu/mobile`'s filesystem driver), and read back once at startup. Framework free, so the
// composables and the tests share it; the app reaches it through `provideCachedFetchStorage` / `hydrateCachedFetch`.

/** What `useCachedFetch` needs of a storage. Any unstorage `Storage` has it. */
export interface CachedFetchStorage {
  getKeys: (base?: string) => Promise<string[]>
  getItem: (key: string) => Promise<unknown>
  setItem: (key: string, value: PersistedCachedFetchEntry) => Promise<void>
  removeItem: (key: string) => Promise<void>
}

export interface CachedFetchStorageOptions {
  /**
   * How old (ms) a stored response may be and still be shown at startup. Older ones are deleted instead. Default
   * seven days: past that, the data is more likely to mislead than to help.
   */
  maxAge?: number
  /** How long (ms) writes are held, so a burst of responses becomes one write per key. Default `250`. */
  debounce?: number
}

/** One stored response. `key` is the cache key as `useCachedFetch` names it (storage keys are encoded). */
export interface PersistedCachedFetchEntry {
  v: 1
  key: string
  at: number
  data: unknown
}

/** A response read back from storage, for the in-memory store. */
export interface RestoredCachedFetchEntry {
  key: string
  at: number
  data: unknown
}

export const CACHED_FETCH_MAX_AGE = 7 * 24 * 60 * 60 * 1000
const DEFAULT_DEBOUNCE = 250
/** The scope when nobody is signed in, or the app has no sign-in. */
export const GUEST_SCOPE = 'guest'

interface Persistence {
  storage: CachedFetchStorage
  maxAge: number
  debounce: number
  pending: Map<string, PersistedCachedFetchEntry>
  timer: ReturnType<typeof setTimeout> | undefined
  flushing: Promise<void>
}

// One per JS realm: only the browser of a client-only app provides a storage (never a server, which serves many
// visitors), so there is one app and one visitor here.
let persistence: Persistence | null = null
let scope = GUEST_SCOPE

/**
 * Storage keys are `<scope>:<cache key>`, both URI-encoded: unstorage treats `:`, `/` and `\` as separators and drops
 * what follows a `?`, which cache keys may contain. Encoded, neither has any of those.
 */
export const storageKeyOf = (key: string, owner = scope) => `${encodeURIComponent(owner)}:${encodeURIComponent(key)}`
const scopePrefix = (owner = scope) => `${encodeURIComponent(owner)}:`

/** Who the cache belongs to: `user:<id>` signed in, else `guest`. */
export const cachedFetchScopeOf = (userId: unknown): string =>
  userId === undefined || userId === null || userId === '' ? GUEST_SCOPE : `user:${String(userId)}`

export function setPersistence(storage: CachedFetchStorage | null, options: CachedFetchStorageOptions = {}) {
  if (persistence?.timer) clearTimeout(persistence.timer)
  persistence = storage
    ? {
        storage,
        maxAge: options.maxAge ?? CACHED_FETCH_MAX_AGE,
        debounce: options.debounce ?? DEFAULT_DEBOUNCE,
        pending: new Map(),
        timer: undefined,
        flushing: Promise.resolve(),
      }
    : null
}

export const hasPersistence = () => !!persistence
export const getScope = () => scope

/**
 * Switches whose responses are stored. Returns `true` when the owner changed: the caller then forgets the in-memory
 * responses, which belonged to the previous owner. Pending writes of the previous owner are dropped; its stored
 * responses are deleted (`purgeOtherScopes`), so one person's data never stays on the device after they leave.
 */
export function setScope(next: string): boolean {
  if (next === scope) return false
  scope = next
  if (persistence) {
    persistence.pending.clear()
    void purgeOtherScopes()
  }
  return true
}

/** Queues a write of `key`'s response. Never throws and never blocks: a failed write is only logged in development. */
export function persistEntry(key: string, at: number, data: unknown) {
  const current = persistence
  if (!current) return
  current.pending.set(key, { v: 1, key, at, data })
  if (current.timer) return
  current.timer = setTimeout(() => {
    current.timer = undefined
    void flushPersistence()
  }, current.debounce)
}

/** Writes the queued responses now (the app going to the background, tests). */
export function flushPersistence(): Promise<void> {
  const current = persistence
  if (!current) return Promise.resolve()
  if (current.timer) {
    clearTimeout(current.timer)
    current.timer = undefined
  }
  const owner = scope
  const batch = [...current.pending.values()]
  current.pending.clear()
  current.flushing = current.flushing.then(() => Promise.all(batch.map(entry =>
    current.storage.setItem(storageKeyOf(entry.key, owner), entry).catch(report('write')),
  ))).then(() => undefined)
  return current.flushing
}

/** Deletes stored responses: the keys `drops` accepts, or all of the current owner's. Pending writes go too. */
export async function removePersisted(drops: (key: string) => boolean = () => true): Promise<void> {
  const current = persistence
  if (!current) return
  for (const key of [...current.pending.keys()]) if (drops(key)) current.pending.delete(key)
  const prefix = scopePrefix()
  try {
    // After the writes in flight, so a write that was already on its way does not bring a key back.
    await current.flushing
    const keys = (await current.storage.getKeys()).filter(stored => stored.startsWith(prefix))
    await Promise.all(keys
      .filter(stored => drops(decode(stored.slice(prefix.length))))
      .map(stored => current.storage.removeItem(stored).catch(report('delete'))))
  }
  catch (error) {
    report('delete')(error)
  }
}

/** Deletes what other owners left on the device (a user who signed out, another account). */
async function purgeOtherScopes(): Promise<void> {
  const current = persistence
  if (!current) return
  const prefix = scopePrefix()
  try {
    // After the writes in flight, so a response of the previous owner that was on its way is deleted too.
    await current.flushing
    const keys = (await current.storage.getKeys()).filter(stored => !stored.startsWith(prefix))
    await Promise.all(keys.map(stored => current.storage.removeItem(stored).catch(report('delete'))))
  }
  catch (error) {
    report('delete')(error)
  }
}

/**
 * Reads the current owner's stored responses: the ones younger than `maxAge`, after deleting the older ones and
 * everything other owners left behind. Never throws: an unreadable storage reads as empty.
 */
export async function readPersisted(now = Date.now()): Promise<RestoredCachedFetchEntry[]> {
  const current = persistence
  if (!current) return []
  const prefix = scopePrefix()
  let keys: string[]
  try {
    keys = await current.storage.getKeys()
  }
  catch (error) {
    report('read')(error)
    return []
  }
  const stale: string[] = keys.filter(stored => !stored.startsWith(prefix))
  const restored: RestoredCachedFetchEntry[] = []
  await Promise.all(keys.filter(stored => stored.startsWith(prefix)).map(async (stored) => {
    const entry = await current.storage.getItem(stored).catch(report('read'))
    if (!isPersistedEntry(entry) || now - entry.at >= current.maxAge || entry.at > now + 60_000) {
      stale.push(stored)
      return
    }
    restored.push({ key: entry.key, at: entry.at, data: entry.data })
  }))
  void Promise.all(stale.map(stored => current.storage.removeItem(stored).catch(report('delete'))))
  return restored
}

function isPersistedEntry(value: unknown): value is PersistedCachedFetchEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<PersistedCachedFetchEntry>
  return entry.v === 1 && typeof entry.key === 'string' && typeof entry.at === 'number' && Number.isFinite(entry.at) && entry.data !== undefined
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value)
  }
  catch {
    return value
  }
}

const report = (action: string) => (error: unknown): undefined => {
  if (import.meta.dev) console.warn(`[ui] Could not ${action} a cached response:`, error)
  return undefined
}

/** Back to the initial state (tests). */
export function resetPersistence() {
  setPersistence(null)
  scope = GUEST_SCOPE
}
