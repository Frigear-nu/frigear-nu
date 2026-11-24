import { defineNuxtPlugin } from '#imports'
import { detectOs, isTauri } from '../../shared/native'

/** Marks the document inside the desktop app: `<html class="desktop" data-desktop="macos|windows|linux|unknown">`. */
export default defineNuxtPlugin({
  name: 'desktop',
  setup() {
    if (!isTauri()) return
    const root = document.documentElement
    root.classList.add('desktop')
    root.dataset.desktop = detectOs(navigator.userAgent)
  },
})
