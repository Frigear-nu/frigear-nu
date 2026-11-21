import { describe, expect, it } from 'vitest'
import {
  helpArticleInput,
  helpArticlePatchSchema,
  helpArticlesQuery,
  helpCategoryInput,
  helpCategoryPatchSchema,
  helpChecklistInput,
  helpReadInput,
  helpSendInput,
} from '../../src/runtime/server/utils/help-center-schemas'

const category = { slug: 'safety', name: { da: 'Sikkerhed', en: 'Safety' } }
const article = { categoryId: 'hlc_1', slug: 'first-aid', title: { da: 'Førstehjælp', en: 'First aid' }, body: 'Plain body' }

describe('category input', () => {
  it('accepts a minimal category and a full one', () => {
    expect(helpCategoryInput.safeParse(category).success).toBe(true)
    expect(helpCategoryInput.safeParse({
      ...category,
      description: 'About it',
      parentId: 'hlc_0',
      owner: { type: 'operation', id: 'opr_1' },
      grants: [{ kind: 'role', role: 'supervisor' }, { kind: 'team', teamId: 'tem_1', minRole: 'lead' }],
      faqGroups: ['volunteering', 'membership'],
      sort: 3,
    }).success).toBe(true)
  })

  it('takes grants in the shape of a list (each kind is checked in the handler)', () => {
    expect(helpCategoryInput.safeParse({ ...category, grants: { kind: 'public' } }).success).toBe(false)
    expect(helpCategoryPatchSchema.safeParse({ grants: [{ role: 'x' }] }).success).toBe(false)
    expect(helpCategoryPatchSchema.safeParse({ grants: null }).success).toBe(false)
  })

  it('refuses reserved and malformed slugs, also for FAQ groups', () => {
    for (const slug of ['search', 'articles', 'Not Valid', '']) expect(helpCategoryInput.safeParse({ ...category, slug }).success, slug).toBe(false)
    expect(helpCategoryInput.safeParse({ ...category, faqGroups: ['Not Valid'] }).success).toBe(false)
  })

  it('drops empty translations and needs one text', () => {
    expect(helpCategoryInput.parse({ ...category, name: { da: '', en: 'Safety' } }).name).toEqual({ en: 'Safety' })
    expect(helpCategoryInput.safeParse({ ...category, name: {} }).success).toBe(false)
  })

  it('lets a patch carry any of the fields, or none', () => {
    expect(helpCategoryPatchSchema.safeParse({}).success).toBe(true)
    expect(helpCategoryPatchSchema.safeParse({ grants: [], description: null, parentId: null }).success).toBe(true)
  })
})

describe('article input', () => {
  it('accepts an article with a plain or translated body', () => {
    expect(helpArticleInput.safeParse(article).success).toBe(true)
    expect(helpArticleInput.safeParse({ ...article, body: { da: 'Brødtekst', en: 'Body' }, grants: [{ kind: 'public' }] }).success).toBe(true)
  })

  it('needs a category, a slug and a title', () => {
    for (const key of ['categoryId', 'slug', 'title', 'body'] as const) {
      const { [key]: _removed, ...rest } = article
      expect(helpArticleInput.safeParse(rest).success, key).toBe(false)
    }
  })

  it('takes grants in the shape of a list, or null to inherit the category', () => {
    expect(helpArticleInput.safeParse({ ...article, grants: { kind: 'public' } }).success).toBe(false)
    expect(helpArticlePatchSchema.safeParse({ grants: [{ kind: 'public' }] }).success).toBe(true)
    expect(helpArticlePatchSchema.safeParse({ grants: null }).success).toBe(true)
  })

  it('does not take a status or a public flag: the status has its own routes and public is a `public` grant', () => {
    expect(helpArticlePatchSchema.parse({ status: 'published', public: true, title: 'T' })).toEqual({ title: 'T' })
  })
})

describe('queries and bodies', () => {
  it('reads the public flag', () => {
    expect(helpArticlesQuery.parse({}).public).toBe(false)
    expect(helpArticlesQuery.parse({ public: '1' }).public).toBe(true)
    expect(helpArticlesQuery.parse({ public: 'true' }).public).toBe(true)
    expect(helpArticlesQuery.safeParse({ public: 'yes' }).success).toBe(false)
  })

  it('trims a search term and refuses an empty one', () => {
    expect(helpArticlesQuery.parse({ q: ' first ' }).q).toBe('first')
    expect(helpArticlesQuery.safeParse({ q: '  ' }).success).toBe(false)
  })

  it('needs the id of an article to mark it read', () => {
    expect(helpReadInput.safeParse({ articleId: 'hlp_1' }).success).toBe(true)
    expect(helpReadInput.safeParse({ articleId: 'content:help:safety/first-aid' }).success).toBe(true)
    expect(helpReadInput.safeParse({}).success).toBe(false)
    expect(helpReadInput.safeParse({ articleId: '' }).success).toBe(false)
  })

  it('takes a checklist with ordered items', () => {
    expect(helpChecklistInput.safeParse({ name: 'Onboarding' }).success).toBe(true)
    expect(helpChecklistInput.safeParse({ name: { da: 'Intro', en: 'Intro' }, operationId: 'opr_1', items: [{ articleId: 'hlp_1' }, { articleId: 'hlp_2', required: false }] }).success).toBe(true)
    expect(helpChecklistInput.safeParse({ name: 'x', items: [{ articleId: '' }] }).success).toBe(false)
  })

  it('needs somebody to send to, a channel and an article', () => {
    const ok = { articleIds: ['hlp_1'], audience: { userIds: ['1'] }, channels: ['email'] }
    expect(helpSendInput.safeParse(ok).success).toBe(true)
    expect(helpSendInput.safeParse({ ...ok, audience: {} }).success).toBe(false)
    expect(helpSendInput.safeParse({ ...ok, channels: [] }).success).toBe(false)
    expect(helpSendInput.safeParse({ ...ok, channels: ['push'] }).success).toBe(false)
    expect(helpSendInput.safeParse({ ...ok, articleIds: [] }).success).toBe(false)
    expect(helpSendInput.safeParse({ ...ok, audience: { grants: [{ kind: 'role', role: 'x' }, { kind: 'team', teamId: 't', minRole: 'lead' }] } }).success).toBe(true)
    // An unknown audience key is refused instead of silently widening what was meant.
    expect(helpSendInput.safeParse({ ...ok, audience: { everyone: true } }).success).toBe(false)
  })
})
