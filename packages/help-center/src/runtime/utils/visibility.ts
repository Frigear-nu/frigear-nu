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

/** What the ancestor walk needs of a category row. */
export type HelpCategoryNode = { id: string, parentId: string | null, visibility: unknown }

/**
 * A category and its ancestors, the category first. A parent that does not exist ends the chain (the category counts as
 * top level), and a loop is cut, so a bad row can never hang a request.
 */
export function categoryChain<T extends HelpCategoryNode>(category: T, byId: ReadonlyMap<string, T>): T[] {
  const chain: T[] = [category]
  const seen = new Set([category.id])
  for (let parent = category.parentId ? byId.get(category.parentId) : undefined; parent && !seen.has(parent.id) && chain.length < 50; parent = parent.parentId ? byId.get(parent.parentId) : undefined) {
    chain.push(parent)
    seen.add(parent.id)
  }
  return chain
}

/** A category is visible only when it and every ancestor are: a subcategory can narrow its parent, never widen it. */
export function isHelpChainVisible(chain: ReadonlyArray<{ visibility: unknown }>, viewer: Viewer | null): boolean {
  return chain.every(node => isVisible(parseVisibility(node.visibility), viewer))
}

/** An article is visible when its whole category chain is, and so is the article unless it is empty and inherits. */
export function isHelpArticleVisibleIn(chain: ReadonlyArray<{ visibility: unknown }>, article: { visibility: unknown }, viewer: Viewer | null): boolean {
  if (!isHelpChainVisible(chain, viewer)) return false
  const own = parseVisibility(article.visibility)
  return isEmptyVisibility(own) || isVisible(own, viewer)
}
