// `@frigear-nu/help-center/source`: framework-free, so a host's own source (a plugin, a test) can import it without Nitro.
import type { HelpCenterSource } from '../../types'

export type {
  HelpArticleDto,
  HelpCategoryDto,
  HelpCenterSource,
  HelpSourceArticle,
  HelpSourceCategory,
  HelpSourceContext,
  HelpSourceListContext,
} from '../../types'

/**
 * Defines an article source: where articles come from. It returns the published articles the reader may read
 * (`list`, `get`, `getById`) and the categories it knows (`categories`, each with whether the reader may read it).
 * Register it in a server plugin with `registerHelpCenterSource(source)` and list its id in `settings.sources`.
 *
 *     export default defineNitroPlugin(() => registerHelpCenterSource(defineHelpCenterSource({
 *       id: 'wiki', readOnly: true, list: ..., get: ..., categories: ...,
 *     })))
 */
export function defineHelpCenterSource(source: HelpCenterSource): HelpCenterSource {
  return source
}
