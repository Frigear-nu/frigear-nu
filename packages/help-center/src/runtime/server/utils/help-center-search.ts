import { searchText } from '@frigear-nu/module-kit/server'
import type { SearchSource } from '@frigear-nu/module-kit/server'

/** `help_articles.searchText`: the title in every language and the slug, folded (on create, edit and by `search:reindex`). */
export const helpArticleSearchText = (article: { title: SearchSource, slug: string }): string => searchText(article.title, article.slug)

/** `help_articles.searchBody`: the body in every language, folded (on create, edit and by `search:reindex`). */
export const helpArticleSearchBody = (body: SearchSource): string => searchText(body)
