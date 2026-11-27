import type { EmailDriver, EmailSendResult } from '../../../types'
import { resolveFrom, toArray, type EmailConfig } from './shared'
import { buildMimeMessage, generateMessageId, splitAddress } from './mime'

// Sends through a Cloudflare Workers `send_email` binding (`env.<NAME>.send(new EmailMessage(from, to, raw))`), with a
// raw MIME message built here, so the email carries a Message-ID of our own: the driver returns it, and the inbox
// threads answers by it. Only runs on Cloudflare Workers; elsewhere the binding is missing and the send fails.

export interface CloudflareBindingConfig extends EmailConfig {
  /** The name of the `send_email` binding (`NUXT_NOTIFY_EMAIL_BINDING_NAME`). Defaults to `SEND_EMAIL`. */
  name?: string
}

/** The `send_email` binding, as far as the driver uses it. */
export type SendEmailBinding = { send: (message: unknown) => Promise<unknown> }
/** `EmailMessage` of `cloudflare:email`. */
export type EmailMessageConstructor = new (from: string, to: string, raw: string) => unknown

export type CloudflareBindingDeps = {
  /** The Worker's bindings; defaults to the ones Nitro's Cloudflare presets keep on `globalThis.__env__`. */
  env?: Record<string, unknown>
  /** Defaults to `EmailMessage` of `cloudflare:email`. */
  EmailMessage?: EmailMessageConstructor
}

export const DEFAULT_BINDING_NAME = 'SEND_EMAIL'

/** `EmailMessage` of `cloudflare:email`, imported at run time: the specifier is not bundled (it only exists on Workers). */
async function loadEmailMessage(): Promise<EmailMessageConstructor> {
  const specifier = 'cloudflare:email'
  try {
    const module = await import(/* @vite-ignore */ specifier) as { EmailMessage: EmailMessageConstructor }
    return module.EmailMessage
  }
  catch {
    throw new Error('[notify] The cloudflare-binding email driver only runs on Cloudflare Workers (cloudflare:email is missing).')
  }
}

export const createCloudflareBindingDriver = (config: CloudflareBindingConfig, deps: CloudflareBindingDeps = {}): EmailDriver => async (n): Promise<EmailSendResult> => {
  const name = config.name || DEFAULT_BINDING_NAME
  const env = deps.env ?? (globalThis as { __env__?: Record<string, unknown> }).__env__
  const binding = env?.[name] as SendEmailBinding | undefined
  if (!binding || typeof binding.send !== 'function') {
    throw new Error(`[notify] Missing the send_email binding "${name}": add it to the Worker (wrangler send_email) or set NUXT_NOTIFY_EMAIL_BINDING_NAME`)
  }
  const from = resolveFrom(config, n)
  const sender = splitAddress(from).address
  const to = toArray(n.to)
  const cc = n.cc ? toArray(n.cc) : []
  const messageId = generateMessageId(sender)
  const raw = buildMimeMessage({ from, to, cc, replyTo: n.replyTo, subject: n.subject, html: n.body, text: n.text, headers: n.headers, messageId })
  const EmailMessage = deps.EmailMessage ?? await loadEmailMessage()
  // One envelope per recipient (an `EmailMessage` has one), all with the same message and Message-ID.
  for (const recipient of [...new Set([...to, ...cc].map(address => splitAddress(address).address))]) {
    await binding.send(new EmailMessage(sender, recipient, raw))
  }
  return { messageId }
}
