import { createError } from 'h3'

/** The `data` of every error a route throws through the toolkit: a snake_case `code` plus optional details. */
export type ApiErrorData = { code: string } & Record<string, unknown>

/**
 * The one error shape of every module route: `statusMessage` is the human message (what `errorMessage()` in
 * `@frigear-nu/ui` shows in a toast), `data.code` a stable snake_case code for clients and tests.
 *
 *     throw apiError(409, 'conflict', 'That slug is taken.', { field: 'slug' })
 */
export function apiError(statusCode: number, code: string, message: string, data: Record<string, unknown> = {}) {
  return createError({ statusCode, statusMessage: message, data: { ...data, code } satisfies ApiErrorData })
}

/** 400 `bad_request`. */
export const badRequest = (message = 'Bad request.', data?: Record<string, unknown>) =>
  apiError(400, 'bad_request', message, data)

/** 403 `forbidden`. */
export const forbidden = (message = 'You are not allowed to do that.', data?: Record<string, unknown>) =>
  apiError(403, 'forbidden', message, data)

/** 404 `not_found`. */
export const notFound = (message = 'Not found.', data?: Record<string, unknown>) =>
  apiError(404, 'not_found', message, data)

/** 409 `conflict`. */
export const conflict = (message = 'Conflict.', data?: Record<string, unknown>) =>
  apiError(409, 'conflict', message, data)

/** 501 `not_configured`: a feature the host has not set up (a missing secret, a disabled provider). */
export const notConfigured = (message = 'This feature is not configured.', data?: Record<string, unknown>) =>
  apiError(501, 'not_configured', message, data)

/**
 * 400 `validation_failed` with the issues in `data.issues`, for validation a route does by hand. Input parsed with
 * `readValidatedBody`/`getValidatedQuery`/`getValidatedRouterParams` already fails with h3's own 400.
 */
export const validationError = (issues: unknown, message = 'Validation Error') =>
  apiError(400, 'validation_failed', message, { issues })
