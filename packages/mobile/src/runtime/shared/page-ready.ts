export interface PageReadyContext {
  /** Registers a `page:loading:end` listener (Nuxt's `nuxtApp.hook`); returns its removal. */
  onPageLoaded: (listener: () => void) => () => void
  /** The current route's full path. */
  currentPath: () => string
  /** Waits for the watchers to run and the browser to paint (`nextTick`, then a frame). */
  settle: () => Promise<void>
  /** Longest wait for the page, in ms, so a request that hangs cannot keep the old screen up. Default 1000. */
  timeout?: number
}

/**
 * Runs `navigate` and resolves once the new page is on screen: `page:loading:end` (every async `setup` under
 * `<NuxtPage>` resolved, awaited data included, also for a page kept alive), then `settle`. Does not wait for a page
 * when the route did not change (a guard, the same page).
 */
export async function navigateWhenReady(context: PageReadyContext, navigate: () => unknown): Promise<void> {
  const before = context.currentPath()
  let release!: () => void
  const loaded = new Promise<void>(resolve => (release = resolve))
  const unhook = context.onPageLoaded(() => release())
  const timer = setTimeout(() => release(), context.timeout ?? 1000)
  try {
    await navigate()
    if (context.currentPath() !== before) await loaded
    await context.settle()
  }
  finally {
    clearTimeout(timer)
    unhook()
  }
}
