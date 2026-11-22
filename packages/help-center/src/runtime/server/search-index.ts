import { schema } from '@nuxthub/db'
import { defineSearchIndex } from '@frigear-nu/module-kit/server'
import { helpArticleSearchBody, helpArticleSearchText } from './utils/help-center-search'

// `help_articles.searchText` and `searchBody` for the `search:reindex` task, computed like on create and edit.
export default defineSearchIndex({
  table: schema.helpArticles,
  columns: article => ({ searchText: helpArticleSearchText(article), searchBody: helpArticleSearchBody(article.body) }),
})
