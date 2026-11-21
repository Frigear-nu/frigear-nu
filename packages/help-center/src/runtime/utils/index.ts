// Pure helpers, safe to import from the Vue app as well as Nitro code.
import { translate } from '@frigear-nu/ui/translated'

export { translate }
export * from './api'
export * from './slug'
export * from './publish'
export * from './grants'
export * from './markdown'
export * from './paths'
export * from './content'
export * from './merge'

export type {
  AdminHelpArticleDto,
  AdminHelpCategoryDto,
  AdminHelpChecklistDto,
  AdminHelpChecklistItemDto,
  HelpArticleDetailDto,
  HelpArticleDto,
  HelpArticleStatus,
  HelpArticleSummaryDto,
  Grant,
  HelpAudience,
  HelpReader,
  HelpCategoryDto,
  HelpCenterSource,
  HelpChecklistDto,
  HelpChecklistItemDto,
  HelpProgressRow,
  HelpSendResult,
  HelpSourceCategory,
  HelpSourceContext,
  HelpSourceListContext,
  MissingTranslations,
  ModuleOptions,
  OwnerRef,
  Translated,
} from '../../types'

/** Random, prefixed id (`hlc_...`, `hlp_...`), Web Crypto only so it works on Workers. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}
