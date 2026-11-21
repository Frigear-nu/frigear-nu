import { z } from 'zod'
import { pageQuery, pageRange, paginate } from '@frigear-nu/module-kit/server'
import type { Page } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'
import { contentArticleDto } from '../../content-source'
import { translate } from '../../../utils'
import type { AdminHelpArticleDto } from '../../../../types'

const querySchema = pageQuery({
  sort: ['updatedAt', 'title', 'slug'],
  defaultSort: 'updatedAt',
  defaultOrder: 'desc',
  filters: {
    status: z.enum(['draft', 'published']).optional(),
    category: z.string().trim().max(128).optional(),
    source: z.enum(['all', 'database', 'content']).default('all'),
  },
})

// Every article of every source, whatever its status or visibility: the database ones (editable) and, with Nuxt Content,
// its files (read-only, always published and public). `q` searches the title in every language and the URL name;
// `category` is a category's URL name; `source` limits to one source. Read in memory: staff lists are a few hundred rows.
export default defineEventHandler(async (event): Promise<Page<AdminHelpArticleDto>> => {
  await authorize(event, helpCenterAccess.permissions.manage)
  const query = await getValidatedQuery(event, querySchema.parse)
  const needle = query.q?.toLocaleLowerCase()

  const items: AdminHelpArticleDto[] = []
  if (query.source !== 'content') {
    const rows = await listHelpArticleRows({ q: query.q, status: query.status, categorySlug: query.category || undefined })
    items.push(...rows.map(({ article, category }) => toAdminHelpArticleDto(category, article)))
  }
  if (query.source !== 'database' && (!query.status || query.status === 'published')) {
    for (const article of await helpCenterContentArticles(event)) {
      const dto = toAdminContentArticleDto(contentArticleDto(article))
      const text = [translate(dto.title), dto.slug].join('\n').toLocaleLowerCase()
      if (query.category && dto.categorySlug !== query.category) continue
      if (needle && !text.includes(needle)) continue
      items.push(dto)
    }
  }

  const direction = query.order === 'asc' ? 1 : -1
  items.sort((a, b) => {
    const compare = query.sort === 'title'
      ? translate(a.title).localeCompare(translate(b.title))
      : query.sort === 'slug'
        ? a.slug.localeCompare(b.slug)
        : (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '')
    return compare * direction || a.slug.localeCompare(b.slug)
  })
  const { limit, offset } = pageRange(query)
  return paginate({ total: items.length, query, items: items.slice(offset, offset + limit) })
})
