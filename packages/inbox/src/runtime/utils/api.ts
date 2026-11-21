// Typed path builders of the inbox HTTP API. App code, tests and docs use these instead of string literals, so a changed
// URL is changed in one place. Every id is URL-encoded.

const enc = encodeURIComponent

/** Staff routes, under `/api/admin/inbox`. */
const ADMIN_BASE = '/api/admin/inbox'
/** Webhooks, registered at the providers (an exception to the `/api/<module>` rule). */
const WEBHOOK_BASE = '/api/inbox/webhooks'

export const inboxApi = {
  webhooks: {
    /** `POST` an inbound email (provider-agnostic JSON, `X-Inbox-Signature: sha256=<hmac>`). */
    email: `${WEBHOOK_BASE}/email`,
    /** `GET` (verify token) / `POST` (`X-Hub-Signature-256`) the Meta webhook: WhatsApp, Messenger and Instagram. */
    meta: `${WEBHOOK_BASE}/meta`,
    /** `POST` to a channel a module registered with an `inbound` reader. */
    channel: (channel: string) => `${WEBHOOK_BASE}/${enc(channel)}`,
  },
  admin: {
    /** `GET` open, unassigned and own thread counts. */
    summary: `${ADMIN_BASE}/summary`,
    /** `GET` the mailboxes the caller reads / `POST` a mailbox (`inbox:manage`). */
    mailboxes: `${ADMIN_BASE}/mailboxes`,
    /** `GET` / `PATCH` / `DELETE` one mailbox. */
    mailbox: (id: string) => `${ADMIN_BASE}/mailboxes/${enc(id)}`,
    /** `GET` (paginated, `?mailbox&status&assignee&channel`) threads. */
    threads: `${ADMIN_BASE}/threads`,
    /** `GET` one thread with its messages / `PATCH` its status or assignee. */
    thread: (id: string) => `${ADMIN_BASE}/threads/${enc(id)}`,
    /** `POST` a reply, sent through the thread's channel. */
    messages: (id: string) => `${ADMIN_BASE}/threads/${enc(id)}/messages`,
    /** `POST` an internal note. */
    notes: (id: string) => `${ADMIN_BASE}/threads/${enc(id)}/notes`,
    /** `POST` `{ role }` to hide a thread below a role (`null` shows it again). */
    hide: (id: string) => `${ADMIN_BASE}/threads/${enc(id)}/hide`,
    /** `GET` / `POST` channel accounts (session only). */
    channels: `${ADMIN_BASE}/channels`,
    /** `PATCH` / `DELETE` one channel account (session only). */
    channel: (id: string) => `${ADMIN_BASE}/channels/${enc(id)}`,
    /** `GET` (paginated, `?threadId&contactId&action`) the audit log. */
    audit: `${ADMIN_BASE}/audit`,
    /** `GET` everything stored about a contact (GDPR access request). */
    contactExport: (id: string) => `${ADMIN_BASE}/contacts/${enc(id)}/export`,
    /** `POST` to anonymise a contact and blank their messages (GDPR erasure). */
    contactErase: (id: string) => `${ADMIN_BASE}/contacts/${enc(id)}/erase`,
  },
} as const
