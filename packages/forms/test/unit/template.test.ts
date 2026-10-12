import { describe, expect, it } from 'vitest'
import {
  composeEmail, formDefinitionSchema, renderAnswers, renderTemplateHtml, renderTemplateLine, renderTemplateText, sampleAnswers,
  templateVariables, unknownBodyVariables,
} from '../../src/runtime/utils'
import type { EmailContext, FormDefinition } from '../../src/runtime/utils'

const definition: FormDefinition = {
  mode: 'single',
  storage: 'db',
  steps: [{ id: 'main', fields: [
    { key: 'name', type: 'text', label: 'Name' },
    { key: 'topic', type: 'select', label: { en: 'Topic', da: 'Emne' }, options: [{ value: 'a', label: { en: 'Alpha', da: 'Alfa' } }] },
    { key: 'tags', type: 'checkbox', label: 'Agree' },
    { key: 'docs', type: 'file', label: 'Docs' },
    { key: 'cap', type: 'captcha' },
    { key: 'hidden', type: 'text', showIf: { field: 'name', op: 'eq', value: 'never' } },
  ] }],
  delivery: { email: { to: ['a@example.com'] } },
}

const context = (answers: Record<string, unknown>, locale = 'en', extra: Partial<EmailContext> = {}): EmailContext => ({
  form: { name: 'Contact', slug: 'contact', version: 3 },
  submission: { id: 'sub_1', createdAt: '2026-01-01T00:00:00.000Z', locale },
  answers: renderAnswers(definition, answers, locale),
  ...extra,
})

describe('renderTemplateText', () => {
  it('replaces variables, tolerating whitespace', () => {
    const ctx = context({ name: 'Ann' })
    expect(renderTemplateText('{{form.name}}|{{ form.slug }}|{{\tform.version  }}|{{submission.id}}|{{submission.locale}}|{{submission.createdAt}}', ctx))
      .toBe('Contact|contact|3|sub_1|en|2026-01-01T00:00:00.000Z')
    expect(renderTemplateText('Hi {{ answer.name }}', ctx)).toBe('Hi Ann')
  })

  it('formats answers like the default email', () => {
    const ctx = context({ name: 'Ann', topic: 'a', tags: true, docs: [{ name: 'a.pdf' }, { name: 'b.pdf' }], cap: 'tok' })
    expect(renderTemplateText('{{answer.topic}} {{answer.tags}} {{answer.docs}}', ctx)).toBe('Alpha Yes a.pdf, b.pdf')
    expect(renderTemplateText('{{answer.topic}} {{answer.tags}}', context({ topic: 'a', tags: false }, 'da'))).toBe('Alfa Nej')
    const block = renderTemplateText('{{answers}}', ctx)
    expect(block).toBe('Name: Ann\nTopic: Alpha\nAgree: Yes\nDocs: a.pdf, b.pdf')
    expect(block).not.toContain('cap')
  })

  it('renders unknown variables, missing, hidden and captcha answers empty', () => {
    const ctx = context({ hidden: 'x', cap: 'tok' })
    expect(renderTemplateText('[{{nope}}][{{answer.name}}][{{answer.hidden}}][{{answer.cap}}][{{answer.zzz}}][{{answer.__proto__}}]', ctx)).toBe('[][][][][][]')
    expect(renderTemplateText('[{{submission.id}}]', context({}, 'en', { submission: { id: null, createdAt: '', locale: 'en' } }))).toBe('[]')
  })

  it('does not expand variables inside substituted values', () => {
    const ctx = context({ name: '{{form.name}} {{ answers }}' })
    expect(renderTemplateText('{{answer.name}}', ctx)).toBe('{{form.name}} {{ answers }}')
    expect(renderTemplateHtml('{{answer.name}}', ctx)).toContain('{{form.name}} {{ answers }}')
  })

  it('leaves text that is not a variable alone', () => {
    expect(renderTemplateText('{{ }} {{a b}} {single} {{1x}}', context({}))).toBe('{{ }} {{a b}} {single} {{1x}}')
  })

  it('keeps newlines', () => {
    expect(renderTemplateText('a\r\n{{form.name}}\nb', context({}))).toBe('a\nContact\nb')
  })
})

describe('renderTemplateHtml', () => {
  it('escapes literals and values, converts newlines and embeds the answers table', () => {
    const ctx = context({ name: '<img src=x onerror=alert(1)>\n"q" & more' })
    const html = renderTemplateHtml('<b>hi</b>\n{{answer.name}}\n{{answers}}', ctx)
    expect(html).not.toContain('<b>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;<br>&lt;img src=x onerror=alert(1)&gt;<br>&quot;q&quot; &amp; more<br><table')
    expect(html).toContain('<td style="padding:4px 0;white-space:pre-wrap">&lt;img')
  })

  it('escapes the form name', () => {
    expect(renderTemplateHtml('{{form.name}}', { ...context({}), form: { name: '<i>x</i>', slug: 's', version: 1 } })).toContain('&lt;i&gt;x&lt;/i&gt;')
  })
})

describe('composeEmail', () => {
  it('keeps the generated email without a body', () => {
    const mail = composeEmail({}, context({ name: 'Ann' }, 'en', { files: ['f.txt (docs)'] }))
    expect(mail.subject).toBe('New submission: Contact')
    expect(mail.text).toBe('Name: Ann\nTopic: -\nAgree: -\nDocs: -\n\nFiles stored with the submission: f.txt (docs)')
    expect(mail.body).toContain('<p><strong>Contact</strong></p><table')
    expect(mail.body).toContain('Files stored with the submission: f.txt (docs)')
    expect(composeEmail({ body: '  ' }, context({})).text).toContain('Name: -')
  })

  it('renders the subject as one line and the body per locale', () => {
    const email = { subject: { en: 'New: {{answer.name}}' }, body: { en: 'EN {{answer.topic}}', da: 'DA {{answer.topic}}' } }
    const injected = composeEmail(email, context({ name: 'a\r\nBcc: evil@example.com' }))
    expect(injected.subject).toBe('New: a Bcc: evil@example.com')
    expect(composeEmail(email, context({ topic: 'a' }, 'da')).text).toBe('DA Alfa')
    expect(composeEmail(email, context({ topic: 'a' }, 'sv')).text).toBe('EN Alpha')
    expect(composeEmail({ body: 'plain' }, context({})).text).toBe('plain')
  })

  it('falls back to the default subject when the template renders empty', () => {
    expect(composeEmail({ subject: '{{answer.name}}' }, context({})).subject).toBe('New submission: Contact')
    expect(renderTemplateLine(' a\n\n b ', context({}))).toBe('a b')
  })
})

describe('variables', () => {
  it('lists variable names once', () => {
    expect(templateVariables('{{a}} {{ b.c }} {{a}}')).toEqual(['a', 'b.c'])
  })

  it('reports unknown variables in the subject and every body language', () => {
    const withBody = (body: unknown, subject?: string) => ({ ...definition, delivery: { email: { to: ['a@example.com'], body, subject } } }) as FormDefinition
    expect(unknownBodyVariables(withBody('{{answers}} {{answer.name}} {{form.name}}'))).toEqual([])
    expect(unknownBodyVariables(withBody({ en: '{{answer.cap}}', da: '{{foo}}' }, '{{ bar }}'))).toEqual(['bar', 'answer.cap', 'foo'])
    expect(unknownBodyVariables(definition)).toEqual([])
  })

  it('builds sample answers for the answer fields', () => {
    expect(sampleAnswers(definition)).toMatchObject({ topic: 'a', tags: true, docs: [{ name: 'document.pdf' }] })
    expect(sampleAnswers(definition)).not.toHaveProperty('cap')
  })
})

describe('schema', () => {
  const parse = (body: unknown) => formDefinitionSchema.safeParse({ ...definition, delivery: { email: { to: ['a@example.com'], body } } })
  it('accepts a string or per-locale body up to 10k characters', () => {
    expect(parse('hi').success).toBe(true)
    expect(parse({ en: 'hi', da: 'hej' }).success).toBe(true)
    expect(parse('x'.repeat(10_001)).success).toBe(false)
    expect(parse({ en: 'x'.repeat(10_001) }).success).toBe(false)
  })
})
