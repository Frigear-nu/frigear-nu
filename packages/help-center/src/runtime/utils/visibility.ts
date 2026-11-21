import { isEmptyVisibility, isVisible, parseVisibility } from '@frigear-nu/audience'
import type { Viewer, Visibility } from '@frigear-nu/audience'

/** An empty visibility (`{}`) is stored as `null`: both mean "signed-in viewers", or "inherits the category" on an article. */
export function normalizeVisibility(visibility: Visibility | null | undefined): Visibility | null {
  return isEmptyVisibility(visibility) ? null : visibility!
}

/**
 * Whether the viewer reads an article: its category is visible to them, and so is the article unless it is empty and
 * inherits the category. An article can only narrow its category, so a public article in a signed-in-only category stays
 * hidden from anonymous visitors. Both values are read with `parseVisibility`, so an unknown key fails closed.
 *
 * Status is not checked here: only `published` articles reach anyone but staff.
 */
export function isHelpArticleVisible(
  category: { visibility: unknown },
  article: { visibility: unknown },
  viewer: Viewer | null,
): boolean {
  if (!isVisible(parseVisibility(category.visibility), viewer)) return false
  const own = parseVisibility(article.visibility)
  return isEmptyVisibility(own) || isVisible(own, viewer)
}

/** Whether an anonymous visitor reads the category's published article: the category is public and the article does not narrow that. */
export function isHelpArticlePublic(category: { visibility: unknown }, article: { visibility: unknown }): boolean {
  return isHelpArticleVisible(category, article, null)
}
