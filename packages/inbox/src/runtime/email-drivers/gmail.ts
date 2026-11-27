import { apiError, notConfigured } from '@frigear-nu/module-kit/server'
import { defineInboxEmailDriver } from '../utils'
import { GMAIL_AUTHSERV_IDS } from '../utils/email-inbound'
import { parseGmailPush } from '../utils/gmail'

// Google Workspace: every email account with `config.inbound: 'gmail'` is a Workspace mailbox the inbox reads through
// the Gmail API, as the account's address, with a service account that has domain-wide delegation of
// `gmail.readonly`. `users.watch` makes Gmail publish a notification to a Pub/Sub topic whenever a message lands in the
// inbox; a push subscription posts it to `POST /api/inbox/email/gmail` with an OIDC token Google signed. The driver
// checks the token (audience `inbox.gmail.audience`, and the push service account when set), then reads what was added
// since the stored history id (`users.history.list`) and each new message raw, and stores it. The `inbox:gmail` task
// renews the watches (they run out after seven days) and catches up on anything a push missed.
// Answers 501 until it is configured, 401 for a bad token, 200 once the notification is handled (Pub/Sub stops
// retrying), and 502 when the Gmail API fails (Pub/Sub retries the push).

export default defineInboxEmailDriver({
  name: 'gmail',
  async handler(event) {
    if (await inboxIsInternalEmailRequest(event)) return inboxHandleInternalEmail(event)
    const config = inboxConfig(event).gmail
    if (!config.clientEmail || !config.privateKey || !config.audience) {
      throw notConfigured('The Gmail driver needs inbox.gmail.clientEmail, inbox.gmail.privateKey and inbox.gmail.audience.')
    }
    const authorization = getRequestHeader(event, 'authorization') ?? ''
    const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1]
    if (!(await inboxVerifyGooglePush(token, config))) throw apiError(401, 'invalid_token', 'The push token does not verify.')
    const raw = await inboxReadRawBody(event)
    let body: unknown = null
    try {
      body = JSON.parse(raw)
    }
    catch {
      // Not JSON: not a notification.
    }
    const push = parseGmailPush(body)
    if (!push) return { status: 'ignored', reason: 'not_a_gmail_notification' }

    const account = (await inboxEmailAccountsFor('gmail')).find(row => row.address === push.emailAddress)
    if (!account) return { status: 'ignored', reason: 'no_account' }
    try {
      const result = await inboxGmailCatchUp(account, {
        startAt: push.historyId,
        deliver: raw => inboxDeliverRawEmail({ driver: 'gmail', raw, recipients: payload => inboxMailboxRecipients(payload, account.address), authservIds: GMAIL_AUTHSERV_IDS, event }),
      })
      return { status: 'received', delivered: result.delivered }
    }
    catch (error) {
      console.error(`[inbox] could not read the Gmail mailbox of ${account.address}`, error)
      throw apiError(502, 'provider_failed', 'The Gmail API failed; the push is retried.')
    }
  },
})
