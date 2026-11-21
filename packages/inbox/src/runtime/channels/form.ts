import { defineInboxChannel } from '../utils'

// Contact form threads come in through `forms:submitted` (`server/plugins/forms.ts`). There is no form to answer in, so
// replies go by email to the address the person gave, with `Reply-To` set to the account's `config.replyTo` or the
// mailbox's email address.
export default defineInboxChannel({
  id: 'form',
  async send({ thread, account, contact, message }) {
    const replyTo = inboxReplyToAddress(account) ?? await inboxMailboxEmailAddress(thread.mailboxId)
    await inboxSendEmailReply({ thread, contact, body: message.body, replyTo })
  },
})
