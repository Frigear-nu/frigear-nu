import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PARENT_WATCH_ENV, parentWatchEnabled, watchParent } from '../../src/runtime/shared/parent-watch'

function fakeStdin() {
  const stdin = Object.assign(new EventEmitter(), { resume: vi.fn() })
  return stdin
}

describe('parent watch (local mode)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is on only when the shell sets the variable', () => {
    expect(parentWatchEnabled({})).toBe(false)
    expect(parentWatchEnabled({ [PARENT_WATCH_ENV]: '0' })).toBe(false)
    expect(parentWatchEnabled({ [PARENT_WATCH_ENV]: 'false' })).toBe(false)
    expect(parentWatchEnabled({ [PARENT_WATCH_ENV]: '1' })).toBe(true)
  })

  it('fires once when stdin ends, on every platform', () => {
    for (const platform of ['darwin', 'linux', 'win32']) {
      const stdin = fakeStdin()
      const onParentGone = vi.fn()
      watchParent({ stdin, ppid: () => 1, platform, onParentGone })
      expect(stdin.resume).toHaveBeenCalled()
      expect(onParentGone).not.toHaveBeenCalled()
      stdin.emit('end')
      stdin.emit('close')
      expect(onParentGone).toHaveBeenCalledTimes(1)
      expect(onParentGone).toHaveBeenCalledWith('stdin')
    }
  })

  it('falls back to a changed parent pid on Unix', () => {
    let ppid = 42
    const onParentGone = vi.fn()
    watchParent({ stdin: fakeStdin(), ppid: () => ppid, platform: 'linux', onParentGone, interval: 500 })
    vi.advanceTimersByTime(1500)
    expect(onParentGone).not.toHaveBeenCalled()
    ppid = 1
    vi.advanceTimersByTime(500)
    expect(onParentGone).toHaveBeenCalledWith('ppid')
    vi.advanceTimersByTime(5000)
    expect(onParentGone).toHaveBeenCalledTimes(1)
  })

  it('does not poll the parent pid on Windows', () => {
    const ppid = vi.fn(() => 42)
    watchParent({ stdin: fakeStdin(), ppid, platform: 'win32', onParentGone: vi.fn() })
    vi.advanceTimersByTime(5000)
    expect(ppid).not.toHaveBeenCalled()
  })
})
