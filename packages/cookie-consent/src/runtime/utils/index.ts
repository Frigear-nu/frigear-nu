// Framework-agnostic utils, safe to import from a module's `setup()`, server code or tests.
export { extendCookieConsent, defineConsentCategory } from './extend'
export {
  DEFAULT_CATEGORIES,
  mergeCategories,
  computeVersion,
  buildConsent,
  normalizeConsent,
  acceptAllChoices,
  rejectAllChoices,
  localize,
} from './consent'
export type { ConsentCategory, ConsentCookie, ConsentState, Translated } from '../../types'
