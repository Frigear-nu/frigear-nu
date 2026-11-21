import { describe, expect, it } from 'vitest'
import { faqGroupInput, faqGroupPatchSchema, faqItemInput, faqItemPatchSchema, faqListQuery, faqSearchQuery, parseFaqSlugs } from '../../src/runtime/server/utils/faq-schemas'

const group = { slug: 'membership', title: { da: 'Medlemskab', en: 'Membership' } }
const item = { question: { da: 'Hvad?', en: 'What?' }, answer: 'Plain answer' }

describe('group input', () => {
  it('accepts a minimal group and a full one', () => {
    expect(faqGroupInput.safeParse(group).success).toBe(true)
    expect(faqGroupInput.safeParse({
      ...group,
      description: 'About it',
      icon: 'i-lucide-info',
      owner: { type: 'operation', id: 'opr_1' },
      grants: [{ kind: 'role', role: 'supervisor' }, { kind: 'team', teamId: 'tem_1', minRole: 'lead' }],
      sort: 3,
    }).success).toBe(true)
  })

  it('takes grants in the shape of a list (each kind is checked in the handler)', () => {
    expect(faqGroupInput.safeParse({ ...group, grants: { kind: 'public' } }).success).toBe(false)
    expect(faqGroupInput.safeParse({ ...group, grants: [{ role: 'x' }] }).success).toBe(false)
    expect(faqGroupInput.safeParse({ ...group, grants: [{ kind: 'Not A Kind' }] }).success).toBe(false)
    expect(faqGroupPatchSchema.safeParse({ grants: null }).success).toBe(false)
    expect(faqGroupPatchSchema.safeParse({ grants: [] }).success).toBe(true)
  })

  it('refuses reserved and malformed slugs', () => {
    for (const slug of ['search', 'groups', 'Not Valid', '']) expect(faqGroupInput.safeParse({ ...group, slug }).success, slug).toBe(false)
  })

  it('drops empty translations and needs one text', () => {
    expect(faqGroupInput.parse({ ...group, title: { da: '', en: 'Membership' } }).title).toEqual({ en: 'Membership' })
    expect(faqGroupInput.safeParse({ ...group, title: {} }).success).toBe(false)
    expect(faqGroupInput.safeParse({ ...group, title: '  ' }).success).toBe(false)
  })

  it('lets a patch carry any of the fields, or none', () => {
    expect(faqGroupPatchSchema.safeParse({}).success).toBe(true)
    expect(faqGroupPatchSchema.safeParse({ grants: [], description: null }).success).toBe(true)
  })
})

describe('item input', () => {
  it('accepts a question with a plain or translated answer and buttons', () => {
    expect(faqItemInput.safeParse(item).success).toBe(true)
    expect(faqItemInput.safeParse({ ...item, links: [{ label: 'Prices', to: '/prices' }, { label: 'Mail', to: 'mailto:a@b.dk' }] }).success).toBe(true)
  })

  it('refuses a button that goes somewhere unsafe', () => {
    for (const to of ['javascript:alert(1)', '//evil.example', '/\\evil.example', 'data:text/html,x', 'ftp://x']) {
      expect(faqItemInput.safeParse({ ...item, links: [{ label: 'x', to }] }).success, to).toBe(false)
    }
  })

  it('takes grants in the shape of a list, or null to inherit the group', () => {
    expect(faqItemInput.safeParse({ ...item, grants: { kind: 'public' } }).success).toBe(false)
    expect(faqItemPatchSchema.safeParse({ grants: [{ kind: 'public' }] }).success).toBe(true)
    expect(faqItemPatchSchema.safeParse({ grants: null }).success).toBe(true)
  })

  it('does not take a status: it has its own routes', () => {
    expect(faqItemPatchSchema.parse({ status: 'published', question: 'Q' })).toEqual({ question: 'Q' })
  })
})

describe('queries', () => {
  it('reads the public flag', () => {
    expect(faqListQuery.parse({}).public).toBe(false)
    expect(faqListQuery.parse({ public: '1' }).public).toBe(true)
    expect(faqListQuery.parse({ public: 'true' }).public).toBe(true)
    expect(faqListQuery.parse({ public: '0' }).public).toBe(false)
    expect(faqListQuery.safeParse({ public: 'yes' }).success).toBe(false)
  })

  it('needs a search term', () => {
    expect(faqSearchQuery.safeParse({}).success).toBe(false)
    expect(faqSearchQuery.safeParse({ q: '  ' }).success).toBe(false)
    expect(faqSearchQuery.parse({ q: ' cost ' }).q).toBe('cost')
  })

  it('splits slugs, trimmed and without repeats', () => {
    expect(parseFaqSlugs('a, b,,a ')).toEqual(['a', 'b'])
    expect(parseFaqSlugs(undefined)).toEqual([])
    expect(parseFaqSlugs('')).toEqual([])
  })
})
