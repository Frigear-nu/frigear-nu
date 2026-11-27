import { notFound } from '@frigear-nu/module-kit/server'
import { defineInboxEmailDriver } from '../utils'

// IMAP: every email account with `config.inbound: 'imap'` and `config.imap` (host, port, ...) is a mailbox the
// `inbox:imap` task polls, with the password of its `secretRef` (`NUXT_INBOX_SECRETS_<REF>`). New messages (a UID above
// the last one seen) are read without marking them read and stored with the account's address as the recipient. The
// task stores them through this driver's route in the same server, with a token only this server knows; from outside
// it is a 404.
export default defineInboxEmailDriver({
  name: 'imap',
  async handler(event) {
    if (!(await inboxIsInternalEmailRequest(event))) throw notFound('This email driver has no webhook.')
    return inboxHandleInternalEmail(event)
  },
})
