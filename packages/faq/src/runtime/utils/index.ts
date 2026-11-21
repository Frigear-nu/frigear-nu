// Pure helpers, safe to import from the Vue app as well as Nitro code.
import { translate } from '@frigear-nu/ui/translated'

export { translate }
export * from './api'
export * from './slug'
export * from './publish'
export * from './reorder'
export * from './grants'
export * from './cards'

export type {
  AdminFaqGroupDto,
  AdminFaqItemDto,
  FaqCardProps,
  FaqGroupDto,
  FaqGroupUpdatedContext,
  FaqItemDto,
  FaqItemPublishedContext,
  FaqItemStatus,
  FaqLink,
  FaqSearchResult,
  MissingTranslations,
  ModuleOptions,
  Grant,
  OwnerRef,
  Translated,
} from '../../types'

/** Random, prefixed id (`faq_...`, `fqi_...`), Web Crypto only so it works on Workers. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}
