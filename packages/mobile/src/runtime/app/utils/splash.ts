import type { NuxtApp } from '#app'
import type { SplashController } from '../../shared/splash'

/** The splash plugin's controller of each app (none when the splash screen is off). */
export const splashControllers = new WeakMap<NuxtApp, SplashController>()
