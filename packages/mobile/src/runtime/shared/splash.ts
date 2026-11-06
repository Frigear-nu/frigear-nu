import type { MobileSplashConfig, SplashScreenOptions } from '../../types'

export const DEFAULT_SPLASH_COMPONENT = 'MobileSplashScreen'
export const SPLASH_DEFAULTS = {
  background: { light: '#ffffff', dark: '#0a0a0a' },
  minDuration: 400,
  maxDuration: 10_000,
}

export interface ResolvedSplashScreen extends MobileSplashConfig {
  /** The component's name, `''` when the splash screen is off. */
  component: string
}

/** `mobile.splashScreen` (`true`, `false`, a component name or options) as one shape. */
export function resolveSplashScreen(option: boolean | string | SplashScreenOptions | undefined): { splash: ResolvedSplashScreen, errors: string[] } {
  const errors: string[] = []
  const options: SplashScreenOptions = option === false ? {} : typeof option === 'string' ? { component: option } : option === true || option === undefined ? {} : option
  const enabled = option !== false
  const component = enabled ? (options.component || DEFAULT_SPLASH_COMPONENT) : ''
  if (component && !/^[A-Z][\dA-Za-z]*$/.test(component)) errors.push(`\`splashScreen.component\` "${component}" is not a PascalCase component name.`)
  const duration = (key: 'minDuration' | 'maxDuration') => {
    const value = options[key] ?? SPLASH_DEFAULTS[key]
    if (!Number.isFinite(value) || value < 0) errors.push(`\`splashScreen.${key}\` must be a number of milliseconds, 0 or more.`)
    return value
  }
  return {
    splash: {
      enabled,
      component,
      logo: options.logo ?? '',
      background: {
        light: options.background?.light ?? SPLASH_DEFAULTS.background.light,
        dark: options.background?.dark ?? SPLASH_DEFAULTS.background.dark,
      },
      minDuration: duration('minDuration'),
      maxDuration: duration('maxDuration'),
      native: enabled && options.native !== false,
    },
    errors,
  }
}

export interface SplashTimers {
  now: () => number
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

export interface SplashController {
  /** Keeps the splash screen up until the returned function is called (more than once is harmless). */
  hold: () => () => void
  /** Keeps it up until the promise settles; returns the promise. */
  waitFor: <T>(promise: Promise<T>) => Promise<T>
  /** Hides it now, whatever holds it. */
  hide: () => void
  readonly hidden: boolean
}

/**
 * When the splash screen hides: once nothing holds it and `minDuration` has passed since it showed, or after
 * `maxDuration` whatever holds it. The caller takes the first hold (the first page's render).
 */
export function createSplashController(options: {
  minDuration: number
  maxDuration: number
  onHide: () => void
  timers?: SplashTimers
}): SplashController {
  const timers: SplashTimers = options.timers ?? {
    now: () => Date.now(),
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
  }
  const start = timers.now()
  let holds = 0
  let hidden = false
  let minTimer: unknown
  let maxTimer: unknown

  const hide = () => {
    if (hidden) return
    hidden = true
    if (minTimer !== undefined) timers.clearTimeout(minTimer)
    if (maxTimer !== undefined) timers.clearTimeout(maxTimer)
    options.onHide()
  }
  const check = () => {
    if (hidden || holds > 0) return
    const remaining = options.minDuration - (timers.now() - start)
    if (remaining <= 0) return hide()
    if (minTimer !== undefined) timers.clearTimeout(minTimer)
    minTimer = timers.setTimeout(() => {
      minTimer = undefined
      check()
    }, remaining)
  }
  const hold = () => {
    if (hidden) return () => {}
    holds++
    let released = false
    return () => {
      if (released) return
      released = true
      holds--
      check()
    }
  }
  if (options.maxDuration > 0) maxTimer = timers.setTimeout(hide, options.maxDuration)

  return {
    hold,
    waitFor: (promise) => {
      const release = hold()
      // Settled either way: a failed start should show the app (and its error), not a splash screen forever.
      promise.then(release, release)
      return promise
    },
    hide,
    get hidden() {
      return hidden
    },
  }
}
