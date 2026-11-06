import { describe, expect, it, vi } from 'vitest'
import { createSplashController, resolveSplashScreen, type SplashTimers } from '../../src/runtime/shared/splash'

describe('resolveSplashScreen', () => {
  it('is off unless configured', () => {
    expect(resolveSplashScreen(undefined).splash).toMatchObject({ enabled: false, component: '', native: false })
    expect(resolveSplashScreen(false).splash).toEqual(resolveSplashScreen(undefined).splash)
  })

  it('turns on with true: MobileSplashScreen, with the native launch screen handed over', () => {
    const { splash, errors } = resolveSplashScreen(true)
    expect(errors).toEqual([])
    expect(splash).toMatchObject({ enabled: true, component: 'MobileSplashScreen', native: true, minDuration: 400, maxDuration: 10_000 })
    expect(resolveSplashScreen({}).splash).toEqual(splash)
  })

  it('takes a component name or options', () => {
    expect(resolveSplashScreen('BrandSplash').splash.component).toBe('BrandSplash')
    const { splash } = resolveSplashScreen({ logo: '/logo.svg', background: { dark: '#000000' }, minDuration: 0, native: false })
    expect(splash).toMatchObject({ component: 'MobileSplashScreen', logo: '/logo.svg', background: { light: '#ffffff', dark: '#000000' }, minDuration: 0, native: false })
  })

  it('rejects a name that is not a component and negative durations', () => {
    expect(resolveSplashScreen('brand-splash').errors).toHaveLength(1)
    expect(resolveSplashScreen({ minDuration: -1, maxDuration: Number.NaN }).errors).toHaveLength(2)
  })
})

describe('createSplashController', () => {
  function setup(minDuration = 400, maxDuration = 10_000) {
    let now = 0
    const queue: { at: number, fn: () => void, id: number }[] = []
    let ids = 0
    const timers: SplashTimers = {
      now: () => now,
      setTimeout: (fn, ms) => {
        const id = ++ids
        queue.push({ at: now + ms, fn, id })
        return id
      },
      clearTimeout: (id) => {
        const index = queue.findIndex(timer => timer.id === id)
        if (index >= 0) queue.splice(index, 1)
      },
    }
    const advance = (ms: number) => {
      now += ms
      for (const timer of queue.filter(timer => timer.at <= now).sort((a, b) => a.at - b.at)) {
        queue.splice(queue.indexOf(timer), 1)
        timer.fn()
      }
    }
    const onHide = vi.fn()
    const controller = createSplashController({ minDuration, maxDuration, onHide, timers })
    return { controller, onHide, advance }
  }

  it('hides once released and minDuration has passed', () => {
    const { controller, onHide, advance } = setup()
    const release = controller.hold()
    advance(100)
    release()
    expect(onHide).not.toHaveBeenCalled()
    advance(299)
    expect(onHide).not.toHaveBeenCalled()
    advance(1)
    expect(onHide).toHaveBeenCalledOnce()
    expect(controller.hidden).toBe(true)
  })

  it('hides at once when released after minDuration', () => {
    const { controller, onHide, advance } = setup()
    const release = controller.hold()
    advance(500)
    release()
    expect(onHide).toHaveBeenCalledOnce()
  })

  it('waits for every hold, and a release counts once', () => {
    const { controller, onHide, advance } = setup(0)
    const first = controller.hold()
    const second = controller.hold()
    first()
    first()
    expect(onHide).not.toHaveBeenCalled()
    second()
    advance(0)
    expect(onHide).toHaveBeenCalledOnce()
  })

  it('releases a waitFor hold when the promise settles either way', async () => {
    const { controller, onHide } = setup(0)
    const failed = controller.waitFor(Promise.reject(new Error('offline')))
    await expect(failed).rejects.toThrow('offline')
    expect(onHide).toHaveBeenCalledOnce()
  })

  it('hides after maxDuration whatever holds it, and hide() hides now', () => {
    const { controller, onHide, advance } = setup(400, 1000)
    controller.hold()
    advance(1000)
    expect(onHide).toHaveBeenCalledOnce()
    controller.hide()
    expect(onHide).toHaveBeenCalledOnce()

    const other = setup(400, 0)
    other.controller.hold()
    other.advance(60_000)
    expect(other.onHide).not.toHaveBeenCalled()
    other.controller.hide()
    expect(other.onHide).toHaveBeenCalledOnce()
  })

  it('ignores holds once hidden', () => {
    const { controller, onHide } = setup(0)
    controller.hide()
    controller.hold()()
    expect(onHide).toHaveBeenCalledOnce()
  })
})
