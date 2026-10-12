import type { FormDefinition, FormField, Translated } from '../../types'
import { isAnswerField, resolveVisibility } from './conditions'
import { translate } from './text'

// Pure email rendering (no Nitro / Vue), shared by the delivery plugin and the admin preview.

export type RenderedAnswer = { key: string, label: string, value: string }

const YES_NO: Record<string, [string, string]> = { en: ['Yes', 'No'], da: ['Ja', 'Nej'] }

const optionLabel = (field: FormField, value: string, locale: string) =>
  translate(field.options?.find(option => option.value === value)?.label, locale) || value

export function formatValue(field: FormField, value: unknown, locale: string): string {
  if (value === undefined || value === null || value === '') return ''
  if (field.type === 'checkbox') return (YES_NO[locale.split(/[-_]/)[0]!] ?? YES_NO.en!)[value === true ? 0 : 1]
  if (field.type === 'file') return Array.isArray(value) ? value.map(file => (file as { name: string }).name).join(', ') : ''
  if ((field.type === 'select' || field.type === 'radio') && typeof value === 'string') return optionLabel(field, value, locale)
  if (Array.isArray(value)) return value.map(entry => (field.options ? optionLabel(field, String(entry), locale) : String(entry))).join(', ')
  return String(value)
}

/** Answers as label/value rows in form order, using the definition the answers were given against. */
export function renderAnswers(definition: FormDefinition, answers: Record<string, unknown>, locale: string): RenderedAnswer[] {
  return resolveVisibility(definition, answers)
    .flatMap(({ fields }) => fields)
    .filter(isAnswerField)
    .map(field => ({
      key: field.key,
      label: translate(field.label as Translated | undefined, locale) || field.key,
      value: formatValue(field, answers[field.key], locale),
    }))
}

export const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function answersToText(rows: RenderedAnswer[]): string {
  return rows.map(row => `${row.label}: ${row.value || '-'}`).join('\n')
}

export function answersToHtml(rows: RenderedAnswer[]): string {
  const body = rows.map(row =>
    `<tr><td style="padding:4px 12px 4px 0;vertical-align:top;font-weight:600">${escapeHtml(row.label)}</td>`
    + `<td style="padding:4px 0;white-space:pre-wrap">${escapeHtml(row.value) || '-'}</td></tr>`,
  ).join('')
  return `<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${body}</table>`
}

/** Everything a template can refer to. */
export type EmailContext = {
  form: { name: string, slug: string, version: number }
  /** `id` is `null` when the form does not store submissions. */
  submission: { id: string | null, createdAt: string, locale: string }
  answers: RenderedAnswer[]
  /** Names of the files stored with the submission. */
  files?: string[]
  replyTo?: string
}

/** `{{ name }}`; names are dotted identifiers. Whitespace inside the braces is ignored. */
const VARIABLE = /\{\{\s*([A-Z_][\w.]*)\s*\}\}/gi

/** Variables that are not tied to a field. */
export const staticVariables = [
  'form.name', 'form.slug', 'form.version', 'submission.id', 'submission.createdAt', 'submission.locale', 'answers', 'files', 'replyTo',
] as const

/** Names used in a template, in order of appearance, without duplicates. */
export function templateVariables(template: string): string[] {
  return [...new Set([...template.matchAll(VARIABLE)].map(match => match[1]!))]
}

/** Plain-text value of a variable, `undefined` when the name is unknown. */
function variableText(name: string, ctx: EmailContext): string | undefined {
  switch (name) {
    case 'form.name': return ctx.form.name
    case 'form.slug': return ctx.form.slug
    case 'form.version': return String(ctx.form.version)
    case 'submission.id': return ctx.submission.id ?? ''
    case 'submission.createdAt': return ctx.submission.createdAt
    case 'submission.locale': return ctx.submission.locale
    case 'answers': return answersToText(ctx.answers)
    case 'files': return (ctx.files ?? []).join(', ')
    case 'replyTo': return ctx.replyTo ?? ''
  }
  if (name.startsWith('answer.')) return ctx.answers.find(row => row.key === name.slice(7))?.value ?? ''
  return undefined
}

/** Splits into literal text and variable names in one pass, so substituted values are never scanned again. */
function tokens(template: string): { literal?: string, name?: string }[] {
  const out: { literal?: string, name?: string }[] = []
  let last = 0
  for (const match of template.matchAll(VARIABLE)) {
    if (match.index > last) out.push({ literal: template.slice(last, match.index) })
    out.push({ name: match[1]! })
    last = match.index + match[0].length
  }
  if (last < template.length) out.push({ literal: template.slice(last) })
  return out
}

const normalizeNewlines = (value: string) => value.replace(/\r\n?/g, '\n')
const textToHtml = (value: string) => escapeHtml(normalizeNewlines(value)).replaceAll('\n', '<br>')

/** Plain-text rendering; unknown variables become empty. */
export function renderTemplateText(template: string, ctx: EmailContext): string {
  return normalizeNewlines(tokens(template).map(token => token.name ? variableText(token.name, ctx) ?? '' : token.literal).join(''))
}

/** HTML rendering: every literal and value is escaped, newlines become `<br>`; `{{answers}}` is the rendered table. */
export function renderTemplateHtml(template: string, ctx: EmailContext): string {
  const html = tokens(template).map((token) => {
    if (!token.name) return textToHtml(token.literal!)
    if (token.name === 'answers') return answersToHtml(ctx.answers)
    return textToHtml(variableText(token.name, ctx) ?? '')
  }).join('')
  return `<div style="font-family:sans-serif;font-size:14px;line-height:1.5">${html}</div>`
}

/** A one-line header value: variables resolved, line breaks collapsed so nothing can inject a header. */
export function renderTemplateLine(template: string, ctx: EmailContext): string {
  return renderTemplateText(template, ctx).replace(/\s*\n\s*/g, ' ').trim()
}

type EmailSettings = { subject?: Translated, body?: Translated }

/** Subject, HTML and text of the notification. Without a custom `body` this is the generated answers email. */
export function composeEmail(email: EmailSettings, ctx: EmailContext): { subject: string, body: string, text: string } {
  const locale = ctx.submission.locale
  const subjectTemplate = translate(email.subject, locale)
  const subject = (subjectTemplate && renderTemplateLine(subjectTemplate, ctx)) || `New submission: ${ctx.form.name}`
  const template = translate(email.body, locale).trim() ? translate(email.body, locale) : ''
  if (template) return { subject, body: renderTemplateHtml(template, ctx), text: renderTemplateText(template, ctx) }

  const files = ctx.files ?? []
  return {
    subject,
    body: `<p><strong>${escapeHtml(ctx.form.name)}</strong></p>${answersToHtml(ctx.answers)}`
      + (files.length ? `<p>Files stored with the submission: ${escapeHtml(files.join(', '))}</p>` : ''),
    text: answersToText(ctx.answers) + (files.length ? `\n\nFiles stored with the submission: ${files.join(', ')}` : ''),
  }
}

/** Variable names an email's subject and body can use for this definition. */
export function availableVariables(definition: FormDefinition): string[] {
  const answerKeys = definition.steps.flatMap(step => step.fields.filter(isAnswerField).map(field => `answer.${field.key}`))
  return [...staticVariables, ...answerKeys]
}

/** Variables in the subject / body (any language) that match nothing; they render empty, so this is a warning. */
export function unknownBodyVariables(definition: FormDefinition): string[] {
  const email = definition.delivery?.email
  if (!email) return []
  const known = new Set(availableVariables(definition))
  const texts = [email.subject, email.body].flatMap(value => !value ? [] : typeof value === 'string' ? [value] : Object.values(value))
  return [...new Set(texts.flatMap(templateVariables))].filter(name => !known.has(name))
}

const sampleValue = (field: FormField): unknown => {
  switch (field.type) {
    case 'email': return 'name@example.com'
    case 'tel': return '+45 12 34 56 78'
    case 'number': return 42
    case 'textarea': return 'A longer message\non two lines.'
    case 'select':
    case 'radio': return field.options?.[0]?.value
    case 'checkbox': return true
    case 'date': return '2026-01-31'
    case 'file': return [{ name: 'document.pdf' }]
    default: return 'Sample text'
  }
}

/** Example answers for every input field, to preview a template with. */
export function sampleAnswers(definition: FormDefinition): Record<string, unknown> {
  return Object.fromEntries(definition.steps.flatMap(step => step.fields.filter(isAnswerField).map(field => [field.key, sampleValue(field)])))
}
