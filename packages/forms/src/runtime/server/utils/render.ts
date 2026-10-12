import type { FormDefinition, FormField, Translated } from '../../../types'
import { isAnswerField, resolveVisibility, translate } from '../../utils'

export type RenderedAnswer = { key: string, label: string, value: string }

const optionLabel = (field: FormField, value: string, locale: string) =>
  translate(field.options?.find(option => option.value === value)?.label, locale) || value

function formatValue(field: FormField, value: unknown, locale: string): string {
  if (value === undefined || value === null || value === '') return ''
  if (field.type === 'checkbox') return value === true ? 'Yes' : 'No'
  if (field.type === 'file') return Array.isArray(value) ? value.map(file => (file as { name: string }).name).join(', ') : ''
  if ((field.type === 'select' || field.type === 'radio') && typeof value === 'string') return optionLabel(field, value, locale)
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
