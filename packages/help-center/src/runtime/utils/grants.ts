import { hasPublicGrant } from '@frigear-nu/auth/grants'

type WithGrants = { grants: unknown }

/** Whether this reader reads one record (a category, an article, a checklist) by its own `grants`. */
export type HelpRecordReader = (record: WithGrants) => Promise<boolean>

/** Whether an article has no list of its own (`null`): everyone who reads its category reads it. */
export function helpArticleInherits(article: WithGrants): boolean {
  return article.grants === null || article.grants === undefined
}

/** What the ancestor walk needs of a category row. */
export type HelpCategoryNode = { id: string, parentId: string | null, grants: unknown }

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

/** A category is readable only when it and every ancestor are: a subcategory can narrow its parent, never widen it. */
export async function isHelpChainReadable(chain: ReadonlyArray<WithGrants>, canRead: HelpRecordReader): Promise<boolean> {
  for (const node of chain) if (!(await canRead(node))) return false
  return true
}

/**
 * An article is readable when its whole category chain is, and so is the article unless it inherits (`grants: null`).
 * An article can only narrow its category, so a public article in a restricted category stays restricted.
 *
 * Status is not checked here: only `published` articles reach anyone but staff.
 */
export async function isHelpArticleReadableIn(chain: ReadonlyArray<WithGrants>, article: WithGrants, canRead: HelpRecordReader): Promise<boolean> {
  if (!(await isHelpChainReadable(chain, canRead))) return false
  return helpArticleInherits(article) || canRead(article)
}

/** Whether a category and every ancestor hold a `public` grant: anonymous visitors read it. */
export function isHelpChainPublic(chain: ReadonlyArray<WithGrants>): boolean {
  return chain.every(node => hasPublicGrant(node.grants))
}

/** Whether an anonymous visitor reads the article: its chain is public and the article does not narrow that. */
export function isHelpArticlePublic(chain: ReadonlyArray<WithGrants>, article: WithGrants): boolean {
  return isHelpChainPublic(chain) && (helpArticleInherits(article) || hasPublicGrant(article.grants))
}
