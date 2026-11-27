import type { EmailNotification } from '../../../types'

export interface EmailConfig {
  from?: string
}

/** True when `headers` has at least one entry, so a driver leaves an empty object out of the request. */
export const hasHeaders = (headers: Record<string, string> | undefined): headers is Record<string, string> => !!headers && Object.keys(headers).length > 0

export const toArray = (value: string | string[]): string[] => Array.isArray(value) ? value : [value]

/** Throws a config error naming the env var an operator needs to set. */
export function requireConfig(value: string | undefined, envVar: string): string {
  if (!value) {
    throw new Error(`[notify] Missing email configuration: set ${envVar}`)
  }
  return value
}

/**
 * The sender of an email: the notification's own `from` when it has one, else the configured one
 * (`NUXT_NOTIFY_EMAIL_FROM`).
 */
export const resolveFrom = (config: EmailConfig, notification?: Pick<EmailNotification, 'from'>) => notification?.from || requireConfig(config.from, 'NUXT_NOTIFY_EMAIL_FROM')

/** `"Name" <a@x.test>` or `Name <a@x.test>` as `{ address, name }`; a bare address as `{ address }`. */
export function parseFromAddress(value: string): { address: string, name?: string } {
  const match = /^([^<>]*)<([^<>\s]+)>\s*$/.exec(value.trim())
  if (!match) return { address: value.trim() }
  const name = match[1]!.trim().replace(/^"|"$/g, '').trim()
  return name ? { address: match[2]!, name } : { address: match[2]! }
}

/** Throws with the provider's response body for any non-2xx response. */
export async function assertOk(provider: string, response: Response): Promise<void> {
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`[notify] ${provider} responded ${response.status}${detail ? `: ${detail}` : ''}`)
  }
}

export type { EmailNotification }
