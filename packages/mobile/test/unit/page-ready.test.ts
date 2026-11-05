import { describe, expect, it, vi } from 'vitest'
import { navigateWhenReady, type PageReadyContext } from '../../src/runtime/shared/page-ready'

function context(timeout?: number) {
  let path = '/'
  const listeners = new Set<() => void>()
  const ctx: PageReadyContext = {
    onPageLoaded: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    currentPath: () => path,
    settle: vi.fn(async () => {}),
    timeout,
  }
  return {
    ctx,
    listeners,
    go: (to: string) => (path = to),
    loaded: () => [...listeners].forEach(listener => listener()),
  }
}

describe('navigateWhenReady', () => {
  it('waits for the page to finish loading, then settles', async () => {
    const page = context()
    let done = false
    const ready = navigateWhenReady(page.ctx, () => page.go('/bills')).then(() => (done = true))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(done).toBe(false)
    page.loaded()
    await ready
    expect(page.ctx.settle).toHaveBeenCalledTimes(1)
    expect(page.listeners.size).toBe(0)
  })

  it('does not wait when the route did not change', async () => {
    const page = context()
    await navigateWhenReady(page.ctx, () => {})
    expect(page.ctx.settle).toHaveBeenCalledTimes(1)
    expect(page.listeners.size).toBe(0)
  })

  it('gives up waiting after the timeout', async () => {
    const page = context(20)
    await navigateWhenReady(page.ctx, () => page.go('/slow'))
    expect(page.ctx.settle).toHaveBeenCalledTimes(1)
  })

  it('removes its listener when the navigation throws', async () => {
    const page = context()
    await expect(navigateWhenReady(page.ctx, () => Promise.reject(new Error('guard')))).rejects.toThrow('guard')
    expect(page.listeners.size).toBe(0)
  })
})
