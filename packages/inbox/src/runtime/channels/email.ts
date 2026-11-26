import { defineInboxChannel } from '../utils'

// Replies to email threads go out with `dispatchEmailNotification` of Notify (the host's driver), from the platform
// address, or from the account's own address when it has `config.sendFromAddress`. `Reply-To` is the thread's reply
// address (`support+ibt_...@`) when the account's address is on an inbox domain, else the account's `config.replyTo`
// or address, so the answer lands in the same mailbox. `In-Reply-To`/`References` name the person's latest email, and
// the subject carries `[ibt_...]`: an answer threads back by its address, its headers or its subject. The people the
// person's last email copied are copied again (`Cc`), without our own addresses, and stored on the reply.
export default defineInboxChannel({
  id: 'email',
  async send({ event, thread, account, mailbox, contact, message }) {
    const replyTo = inboxThreadReplyTo(inboxReplyToAddress(account), thread.id, event)
    const { cc } = await inboxSendEmailReply({ thread, contact, body: message.body, replyTo, from: inboxEmailFrom(account, mailbox) })
    return { cc }
  },
})
