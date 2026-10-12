import { describe, expect, it } from 'vitest'
import { buildFormSchema, composePhone, defaultPhoneCountry, formDefinitionSchema, isFieldVisible, parsePhone, renderMarkdown, resolveEmailDelivery, resolveVisibility } from '../../src/runtime/utils'
import type { FormDefinition } from '../../src/types'

const contact = {
  mode: 'single',
  storage: 'db',
  steps: [{
    id: 'main',
    fields: [
      { key: 'name', type: 'text', required: true, validation: { minLength: 2 } },
      { key: 'email', type: 'email', required: true },
      { key: 'subject', type: 'select', required: true, options: [{ value: 'a', label: 'A' }, { value: 'other', label: 'Other' }] },
      { key: 'subjectOther', type: 'text', required: true, showIf: { field: 'subject', op: 'eq', value: 'other' } },
      { key: 'age', type: 'number', validation: { min: 18 } },
      { key: 'terms', type: 'checkbox', required: true },
    ],
  }],
} satisfies FormDefinition

const stepped = {
  mode: 'stepped',
  storage: 'db',
  steps: [
    { id: 'one', fields: [{ key: 'kind', type: 'radio', options: [{ value: 'org', label: 'Org' }, { value: 'person', label: 'Person' }] }] },
    { id: 'org', showIf: { field: 'kind', op: 'eq', value: 'org' }, fields: [{ key: 'orgName', type: 'text', required: true }] },
    { id: 'files', fields: [{ key: 'logo', type: 'file', required: true, validation: { maxSize: 100, accept: ['image/*'] } }] },
  ],
} satisfies FormDefinition

const valid = { name: 'Ada', email: 'ada@example.com', subject: 'a', terms: true }
const messages = (definition: FormDefinition, answers: Record<string, unknown>, stepIndex?: number) => {
  const result = buildFormSchema(definition, answers, { stepIndex }).safeParse(answers)
  return result.success ? [] : result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
}

describe('buildFormSchema', () => {
  it('accepts valid answers and strips unknown keys', () => {
    const result = buildFormSchema(contact, valid).safeParse({ ...valid, injected: 'x' })
    expect(result.success).toBe(true)
    expect(result.data).toEqual(valid)
  })

  it('reports required, format, range and option errors', () => {
    expect(messages(contact, { name: '', email: 'nope', subject: 'zzz', age: 5, terms: false })).toEqual([
      'name: This field is required.',
      'email: Enter a valid email address.',
      'subject: Choose one of the available options.',
      'age: Must be at least 18.',
      'terms: This field is required.',
    ])
  })

  it('only requires a conditional field while its condition holds', () => {
    expect(messages(contact, { ...valid, subject: 'other' })).toEqual(['subjectOther: This field is required.'])
    expect(messages(contact, { ...valid, subject: 'other', subjectOther: 'Something' })).toEqual([])
    // Hidden again: a stale answer is ignored and stripped.
    const result = buildFormSchema(contact, { ...valid, subjectOther: 'stale' }).safeParse({ ...valid, subjectOther: 'stale' })
    expect(result.data).not.toHaveProperty('subjectOther')
  })

  it('validates one step at a time', () => {
    expect(messages(stepped, { kind: 'org' }, 1)).toEqual(['orgName: This field is required.'])
    expect(messages(stepped, { kind: 'org' }, 0)).toEqual([])
  })

  it('validates file descriptors', () => {
    const answers = (files: { name: string, size: number, type: string }[]) => ({ kind: 'person', logo: files })
    expect(messages(stepped, answers([]))).toEqual(['logo: This field is required.'])
    expect(messages(stepped, answers([{ name: 'a.png', size: 50, type: 'image/png' }]))).toEqual([])
    expect(messages(stepped, answers([{ name: 'a.pdf', size: 500, type: 'application/pdf' }]))).toEqual([
      'logo: a.pdf is larger than 0 MB.',
      'logo: a.pdf is not an accepted file type.',
    ])
    // Single (not `multiple`) file fields hold one file.
    expect(messages(stepped, answers([{ name: 'a.png', size: 1, type: 'image/png' }, { name: 'b.png', size: 1, type: 'image/png' }])))
      .toContain('logo: Upload at most 1 file(s).')
  })

  it('uses a custom translator and per-field message overrides', () => {
    const definition: FormDefinition = { ...contact, steps: [{ id: 'main', fields: [
      { key: 'name', type: 'text', required: true },
      { key: 'email', type: 'text', required: true, validation: { message: { da: 'Mangler', en: 'Missing' } } },
    ] }] }
    const result = buildFormSchema(definition, {}, { t: (key, fallback) => `${key}|${fallback}`, locale: 'da' }).safeParse({})
    expect(result.error?.issues.map(issue => issue.message)).toEqual(['validation.required|This field is required.', 'Mangler'])
  })
})

describe('visibility', () => {
  it('skips hidden steps and ignores answers of hidden fields', () => {
    expect(resolveVisibility(stepped, { kind: 'person' }).map(step => step.step.id)).toEqual(['one', 'files'])
    expect(resolveVisibility(stepped, { kind: 'org' }).map(step => step.step.id)).toEqual(['one', 'org', 'files'])
    expect(isFieldVisible(contact, 'subjectOther', { subject: 'other' })).toBe(true)
    expect(isFieldVisible(contact, 'subjectOther', { subject: 'a' })).toBe(false)
  })

  it('does not let a hidden field keep another field visible', () => {
    const chain: FormDefinition = { mode: 'single', storage: 'db', steps: [{ id: 's', fields: [
      { key: 'a', type: 'text' },
      { key: 'b', type: 'text', showIf: { field: 'a', op: 'eq', value: 'x' } },
      { key: 'c', type: 'text', showIf: { field: 'b', op: 'truthy' } },
    ] }] }
    expect(isFieldVisible(chain, 'c', { a: 'y', b: 'stale' })).toBe(false)
    expect(isFieldVisible(chain, 'c', { a: 'x', b: 'yes' })).toBe(true)
  })
})

describe('empty / notEmpty conditions', () => {
  const when = (op: 'empty' | 'notEmpty' | 'truthy'): FormDefinition => ({ mode: 'single', storage: 'db', steps: [{ id: 's', fields: [
    { key: 'a', type: 'text' },
    { key: 'b', type: 'text', showIf: { field: 'a', op } },
  ] }] })

  it('empty shows only without an answer', () => {
    for (const answer of [undefined, null, '', false, []]) expect(isFieldVisible(when('empty'), 'b', { a: answer })).toBe(true)
    expect(isFieldVisible(when('empty'), 'b', { a: 'x' })).toBe(false)
  })

  it('notEmpty (and its alias truthy) shows only with an answer', () => {
    for (const op of ['notEmpty', 'truthy'] as const) {
      expect(isFieldVisible(when(op), 'b', { a: 'x' })).toBe(true)
      expect(isFieldVisible(when(op), 'b', { a: '' })).toBe(false)
      expect(isFieldVisible(when(op), 'b', {})).toBe(false)
    }
  })

  it('is accepted by the definition schema', () => {
    expect(formDefinitionSchema.safeParse(when('empty')).success).toBe(true)
    expect(formDefinitionSchema.safeParse(when('notEmpty')).success).toBe(true)
  })
})

describe('formDefinitionSchema', () => {
  it('accepts the examples and defaults storage to db', () => {
    expect(formDefinitionSchema.safeParse(contact).success).toBe(true)
    expect(formDefinitionSchema.parse({ ...contact, storage: undefined }).storage).toBe('db')
  })

  const issues = (input: unknown) => {
    const result = formDefinitionSchema.safeParse(input)
    return result.success ? [] : result.error.issues.map(issue => issue.message)
  }
  const single = (fields: unknown[], extra: Record<string, unknown> = {}) => ({ mode: 'single', steps: [{ id: 's', fields }], ...extra })

  it('rejects structural mistakes', () => {
    expect(issues(single([{ key: 'a', type: 'text' }, { key: 'a', type: 'text' }]))).toContain('Duplicate field key "a".')
    expect(issues(single([{ key: 'a', type: 'select' }]))).toContain('Select and radio fields need options.')
    expect(issues(single([{ key: 'a', type: 'text', showIf: { field: 'b', op: 'truthy' } }]))).toContain('Condition refers to unknown or later field "b".')
    expect(issues(single([{ key: 'a', type: 'text', validation: { pattern: '(' } }]))).toContain('Invalid regular expression.')
    expect(issues({ mode: 'single', steps: [{ id: 'a', fields: [] }, { id: 'b', fields: [] }] })).toContain('A single page form has exactly one step.')
  })

  it('rejects file fields without storage', () => {
    expect(issues(single([{ key: 'f', type: 'file' }], { storage: 'none' }))).toContain('File fields need a form that stores submissions (storage "db").')
  })

  it('only allows literal email recipients and same-origin redirects', () => {
    expect(issues(single([], { delivery: { email: { to: ['${contact.default}'] } } }))).toContain('Recipients must be plain email addresses.')
    expect(issues(single([], { delivery: { email: { to: ['a@b.dk'] } } }))).toEqual([])
    expect(issues(single([], { submit: { redirect: '//evil.example' } }))).toContain('Redirect must be a path on this site.')
    expect(issues(single([], { submit: { redirect: '/thanks' } }))).toEqual([])
  })
})

describe('formDefinitionSchema email delivery routing', () => {
  const issues = (input: unknown) => {
    const result = formDefinitionSchema.safeParse(input)
    return result.success ? [] : result.error.issues.map(issue => issue.message)
  }
  const fields = [
    { key: 'email', type: 'email' },
    { key: 'subject', type: 'select', options: [{ value: 'a', label: 'A' }] },
    { key: 'note', type: 'text' },
  ]
  const form = (email: Record<string, unknown>) => ({
    mode: 'single',
    steps: [{ id: 's', fields }],
    delivery: { email: { to: ['fallback@b.dk'], ...email } },
  })

  it('accepts routes on a known field and a reply-to email field', () => {
    expect(issues(form({ routes: { field: 'subject', to: { a: ['x@b.dk'] } }, replyToField: 'email' }))).toEqual([])
  })

  it('rejects unknown route fields, non-email reply-to fields and placeholder recipients', () => {
    expect(issues(form({ routes: { field: 'nope', to: { a: ['x@b.dk'] } } }))).toContain('Unknown field "nope".')
    expect(issues(form({ replyToField: 'note' }))).toContain('Reply-to must be an email field.')
    expect(issues(form({ routes: { field: 'subject', to: { a: ['${x}'] } } }))).toContain('Recipients must be plain email addresses.')
  })
})

describe('renderMarkdown', () => {
  it('escapes html and only links safe urls', () => {
    const html = renderMarkdown('<script>x</script> **bold**\n\n[ok](https://a.dk) [bad](javascript:alert(1))')
    expect(html).not.toContain('<script>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('href="https://a.dk"')
    expect(html).not.toContain('href="javascript:')
  })
})

describe('captcha field', () => {
  const definition: FormDefinition = {
    mode: 'single',
    storage: 'db',
    steps: [{ id: 'main', fields: [
      { key: 'kind', type: 'radio', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
      { key: 'human', type: 'captcha', showIf: { field: 'kind', op: 'eq', value: 'b' } },
    ] }],
  }

  it('is always required while visible, whatever `required` says', () => {
    expect(buildFormSchema(definition, { kind: 'b' }).safeParse({ kind: 'b' }).success).toBe(false)
    expect(buildFormSchema(definition, { kind: 'b' }).safeParse({ kind: 'b', human: '  ' }).success).toBe(false)
    expect(buildFormSchema(definition, { kind: 'b' }).safeParse({ kind: 'b', human: 'token' }).success).toBe(true)
  })

  it('is skipped while hidden or with skipCaptcha', () => {
    expect(buildFormSchema(definition, { kind: 'a' }).safeParse({ kind: 'a' }).success).toBe(true)
    expect(buildFormSchema(definition, { kind: 'b' }, { skipCaptcha: true }).safeParse({ kind: 'b' }).success).toBe(true)
  })

  it('accepts provider settings and refuses unknown providers and conditions on it', () => {
    const field = { key: 'human', type: 'captcha', captcha: { provider: 'hcaptcha', siteKey: 'abc-123', theme: 'dark', size: 'compact' } }
    const parse = (fields: unknown[]) => formDefinitionSchema.safeParse({ mode: 'single', storage: 'db', steps: [{ id: 'main', fields }] })
    expect(parse([field]).success).toBe(true)
    expect(parse([{ ...field, captcha: { provider: 'nope' } }]).success).toBe(false)
    expect(parse([{ ...field, captcha: { siteKey: 'not a key!' } }]).success).toBe(false)
    expect(parse([field, { key: 'x', type: 'text', showIf: { field: 'human', op: 'notEmpty' } }]).success).toBe(false)
  })
})

describe('resolveEmailDelivery', () => {
  const email = { to: ['fallback@b.dk'], routes: { field: 'subject', to: { a: ['a@b.dk'] } }, replyToField: 'email' }

  it('uses the routed recipients, the fallback otherwise, and the reply-to answer', () => {
    expect(resolveEmailDelivery(email, { subject: 'a', email: ' me@b.dk ' })).toEqual({ to: ['a@b.dk'], replyTo: 'me@b.dk' })
    expect(resolveEmailDelivery(email, { subject: 'zzz' })).toEqual({ to: ['fallback@b.dk'], replyTo: undefined })
  })
})

describe('phone fields', () => {
  const phone = (config?: FormDefinition['steps'][number]['fields'][number]['phone']) => ({
    mode: 'single', storage: 'none', steps: [{ id: 's', fields: [{ key: 'tel', type: 'tel', required: true, phone: config }] }],
  }) satisfies FormDefinition
  const check = (config: Parameters<typeof phone>[0], value: string) => {
    const answers = { tel: value }
    return buildFormSchema(phone(config), answers).safeParse(answers).success
  }

  it('accepts free-form numbers in simple mode', () => {
    expect(check(undefined, '12 34 56 78')).toBe(true)
    expect(check(undefined, 'abc')).toBe(false)
  })

  it('requires an international number in country mode', () => {
    expect(check({ mode: 'country' }, '+4512345678')).toBe(true)
    expect(check({ mode: 'country' }, '12345678')).toBe(false)
    expect(check({ mode: 'country' }, '+45123')).toBe(false)
    expect(check({ mode: 'country' }, '+4512345678901234')).toBe(false)
  })

  it('limits the accepted countries', () => {
    const config = { mode: 'country', countries: ['DK', 'SE'] } as const
    expect(check(config, '+4512345678')).toBe(true)
    expect(check(config, '+46701234567')).toBe(true)
    expect(check(config, '+4791234567')).toBe(false)
  })

  it('merges and splits country and number', () => {
    expect(composePhone('DK', '12 34 56 78')).toBe('+4512345678')
    expect(composePhone('GB', '07911 123456')).toBe('+447911123456')
    expect(composePhone('IT', '06 1234567')).toBe('+39061234567')
    expect(composePhone('DK', '')).toBe('')
    expect(parsePhone('+4512345678')).toEqual({ country: 'DK', national: '12345678' })
    expect(parsePhone('+12025550123', undefined, 'CA')).toEqual({ country: 'CA', national: '2025550123' })
    expect(parsePhone('+4512345678', { countries: ['SE'] })).toEqual({ country: 'SE', national: '4512345678' })
  })

  it('picks a default country that is offered', () => {
    expect(defaultPhoneCountry()).toBe('DK')
    expect(defaultPhoneCountry({ countries: ['SE', 'NO'] })).toBe('SE')
    expect(defaultPhoneCountry({ countries: ['SE', 'NO'], defaultCountry: 'no' })).toBe('NO')
  })

  it('validates country codes in the definition', () => {
    const bad = phone({ mode: 'country', countries: ['XX'] })
    expect(formDefinitionSchema.safeParse(bad).success).toBe(false)
    expect(formDefinitionSchema.safeParse(phone({ mode: 'country', countries: ['dk'] })).success).toBe(true)
  })
})
