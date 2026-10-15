import type { ToastProps } from '@nuxt/ui'

type ErrorLike = {
  statusMessage?: unknown
  message?: unknown
  data?: unknown
  response?: { _data?: unknown }
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const field = (value: unknown, key: 'message' | 'statusMessage'): string | undefined =>
  value && typeof value === 'object' ? text((value as Record<string, unknown>)[key]) : undefined

/**
 * The most useful message of an error thrown by `$fetch`, `createError` or plain code: the server's message
 * (`data.message`, `data.statusMessage`, `response._data.message`), then `statusMessage`, then `message`.
 * `fallback` when none is set.
 */
export function errorMessage(e: unknown, fallback: string): string {
  if (typeof e === 'string') return text(e) ?? fallback
  if (!e || typeof e !== 'object') return fallback
  const error = e as ErrorLike
  return field(error.data, 'message')
    ?? field(error.data, 'statusMessage')
    ?? field(error.response?._data, 'message')
    ?? text(error.statusMessage)
    ?? text(error.message)
    ?? fallback
}

/** A Nuxt UI toast for an error: red, with the error's message as description. `overrides` win. */
export function errorToToast(e: unknown, overrides: Partial<ToastProps> = {}): Partial<ToastProps> {
  const description = errorMessage(e, '')
  return {
    title: 'Something went wrong.',
    ...(description ? { description } : {}),
    color: 'error',
    icon: 'i-lucide-circle-alert',
    ...overrides,
  }
}
