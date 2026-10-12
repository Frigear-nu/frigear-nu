import type { FormDefinition } from '../../types'
import { validatedFields } from './schema'
import { isAnswerField } from './conditions'
import type { Answers } from './conditions'

export type PreviewDevice = 'mobile' | 'desktop'

/** Real rendering width (px) of each preview device. */
export const PREVIEW_WIDTHS: Record<PreviewDevice, number> = { mobile: 390, desktop: 960 }

/** Scale that fits `width` into `available`; never upscales, never collapses to zero. */
export function previewScale(available: number, width: number): number {
  if (!(available > 0) || !(width > 0)) return 1
  return Math.min(1, Math.max(0.1, available / width))
}

const isFile = (value: unknown): value is File => typeof File !== 'undefined' && value instanceof File

/**
 * The answers a real submit would send: only visible input fields (never the captcha token), with files described by
 * name/size/type so the result can be shown as JSON.
 */
export function previewPayload(definition: FormDefinition, answers: Answers): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const field of validatedFields(definition, answers).filter(isAnswerField)) {
    const value = answers[field.key]
    if (value === undefined) continue
    payload[field.key] = Array.isArray(value)
      ? value.map(item => isFile(item) ? { name: item.name, size: item.size, type: item.type } : item)
      : isFile(value) ? { name: value.name, size: value.size, type: value.type } : value
  }
  return payload
}
