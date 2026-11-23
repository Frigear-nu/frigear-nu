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
export * from './faq'

export type {
  AdminHelpArticleDto,
  AdminHelpCategoryDto,
  AdminHelpChecklistDto,
  AdminHelpChecklistItemDto,
  FaqBodyLink,
  FaqBodyParts,
  FaqCardProps,
  HelpArticleDetailDto,
  HelpArticleDto,
  HelpArticleStatus,
  HelpArticleSummaryDto,
  Grant,
  HelpAudience,
  HelpReader,
  HelpUserLookupDto,
  HelpCategoryDisplay,
  HelpCategoryKind,
  HelpCategoryDto,
  HelpFaqDto,
  HelpLink,
  HelpCenterSource,
  HelpChecklistDto,
  HelpChecklistItemDto,
  HelpProgressRow,
  HelpSendResult,
  HelpSendSkip,
  HelpSendSkipReason,
  HelpSourceCategory,
  HelpSourceContext,
  HelpSourceListContext,
  MissingTranslations,
  ModuleOptions,
  OwnerRef,
  Translated,
} from '../../types'

/** Random, prefixed id (`<prefix>_<32 hex>`): the one of `@frigear-nu/module-kit/id`. */
export { newId } from '@frigear-nu/module-kit/id'
