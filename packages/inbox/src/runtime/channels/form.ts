import { defineInboxChannel } from '../utils'

// Contact form threads come in through `forms:submitted` (`server/plugins/forms.ts`). There is no form to answer in, so
// replies go by email to the address the person gave. `Reply-To` is the account's `config.replyTo`, else the address
// of the mailbox's email account (its first on an inbox domain, else its first), as the thread's reply address
// (`support+ibt_...@`) when it is on an inbox domain. That email account's `sendFromAddress` picks the `From`.
export default defineInboxChannel({
  id: 'form',
  async send({ event, thread, account, mailbox, contact, message }) {
    const emailAccount = await inboxMailboxEmailAccount(thread.mailboxId, event)
    const address = inboxReplyToAddress(account) ?? inboxReplyToAddress(emailAccount ?? null)
    const replyTo = inboxThreadReplyTo(address, thread.id, event)
    const { cc, messageId } = await inboxSendEmailReply({ thread, contact, body: message.body, replyTo, from: inboxEmailFrom(emailAccount, mailbox) })
    return { cc, messageId }
  },
})
