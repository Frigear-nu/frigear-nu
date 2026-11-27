/** Longest a pull to refresh waits for the page's data before the spinner goes away anyway, in ms. */
export const PULL_TO_REFRESH_TIMEOUT = 10_000

/**
 * Whether a page has native pull to refresh: its `definePageMeta({ mobile: { pullToRefresh } })`, else the app's
 * `pullToRefresh` option on a tab's root page.
 */
export function wantsPullToRefresh(option: boolean | undefined, page: boolean | undefined, tabRoot: boolean): boolean {
  return page ?? (!!option && tabRoot)
}

export interface PullToRefreshRunner {
  /** Runs a refresh for one pull. A pull while one runs joins it. */
  pull: () => Promise<void>
  /** Whether a refresh runs. */
  readonly running: boolean
}

/**
 * One pull to refresh: `refresh` (every refresh of the page, in parallel; one that fails does not stop the others),
 * then `end` (the spinner goes away). `end` runs after `timeout` ms at the latest, so a request that hangs cannot keep
 * the spinner up.
 */
export function createPullToRefresh(options: {
  refresh: () => unknown
  end: () => unknown
  /** Feedback when the pull starts, e.g. a haptic. */
  onStart?: () => unknown
  timeout?: number
}): PullToRefreshRunner {
  let current: Promise<void> | undefined

  const run = async () => {
    try {
      await options.onStart?.()
    }
    catch {
      // Feedback only.
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<void>(resolve => (timer = setTimeout(resolve, options.timeout ?? PULL_TO_REFRESH_TIMEOUT)))
    try {
      await Promise.race([Promise.resolve().then(options.refresh).catch(() => {}), timedOut])
    }
    finally {
      clearTimeout(timer)
      try {
        await options.end()
      }
      catch {
        // The spinner is gone or the plugin is too old to have one.
      }
    }
  }

  return {
    pull() {
      current ??= run().finally(() => (current = undefined))
      return current
    },
    get running() {
      return current !== undefined
    },
  }
}

/** Runs every handler, in parallel, and resolves once all have settled. */
export async function runRefreshHandlers(handlers: Iterable<() => unknown>): Promise<void> {
  await Promise.allSettled([...handlers].map(handler => Promise.resolve().then(handler)))
}
