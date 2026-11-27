// Polls every IMAP account for new mail (see `inboxImapRun`). Runs on `email.inbound.imap.cron` (every five minutes
// unless set); `payload.limit` caps the messages per account of one run (50 by default).
export default defineTask({
  meta: {
    name: 'inbox:imap',
    description: 'Take in new mail from the IMAP mailboxes of the inbox.',
  },
  async run({ payload }) {
    const limit = typeof payload?.limit === 'number' && Number.isSafeInteger(payload.limit) && payload.limit > 0 ? payload.limit : undefined
    return { result: await inboxImapRun({ limit }) }
  },
})
