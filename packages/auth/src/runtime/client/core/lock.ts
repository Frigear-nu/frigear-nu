import type { LockFn } from './types'

/** One holder per name at a time, within this JavaScript realm. */
export const createMemoryLock = (): LockFn => {
  const tails = new Map<string, Promise<unknown>>()
  return async (name, fn) => {
    const previous = tails.get(name) ?? Promise.resolve()
    const run = previous.catch(() => undefined).then(fn)
    const tail = run.catch(() => undefined)
    tails.set(name, tail)
    try {
      return await run
    }
    finally {
      if (tails.get(name) === tail) tails.delete(name)
    }
  }
}

interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>
}

/**
 * Web Locks (`navigator.locks`) when the platform has them, so tabs of one origin never refresh the same token at
 * once; an in-memory lock otherwise (Node, older webviews).
 */
export const createDefaultLock = (): LockFn => {
  const memory = createMemoryLock()
  return (name, fn) => {
    const locks = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator?.locks
    return typeof locks?.request === 'function' ? locks.request(name, fn) : memory(name, fn)
  }
}
