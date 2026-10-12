import type { EmailNotification } from '../../../types'

export interface EmailConfig {
  from?: string
}

export const toArray = (value: string | string[]): string[] => Array.isArray(value) ? value : [value]

/** Throws a config error naming the env var an operator needs to set. */
export function requireConfig(value: string | undefined, envVar: string): string {
  if (!value) {
    throw new Error(`[notify] Missing email configuration: set ${envVar}`)
  }
  return value
}

export const resolveFrom = (config: EmailConfig) => requireConfig(config.from, 'NUXT_NOTIFY_EMAIL_FROM')

/** Throws with the provider's response body for any non-2xx response. */
export async function assertOk(provider: string, response: Response): Promise<void> {
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`[notify] ${provider} responded ${response.status}${detail ? `: ${detail}` : ''}`)
  }
}

export type { EmailNotification }
