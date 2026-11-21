import { defineInboxChannel } from '../utils'

// Replies to email threads go out with `dispatchEmailNotification` of Notify (the host's driver), from the platform
// address and with `Reply-To` set to the mailbox address the email came in on, so the answer lands in the same mailbox.
// The subject carries `[ibt_...]`, which threads the answer back without custom headers. The people the person's last
// email copied are copied again (`Cc`), without our own addresses.
export default defineInboxChannel({
  id: 'email',
  async send({ thread, account, contact, message }) {
    await inboxSendEmailReply({ thread, contact, body: message.body, replyTo: inboxReplyToAddress(account) })
  },
})
