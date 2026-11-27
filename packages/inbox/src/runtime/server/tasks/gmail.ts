// Renews the watch of every Gmail account that has less than two days left and catches up on anything a push missed
// (see `inboxGmailRun`). Runs on `email.inbound.gmail.cron` (daily unless set).
export default defineTask({
  meta: {
    name: 'inbox:gmail',
    description: 'Renew the Gmail watches of the inbox and take in mail a push notification missed.',
  },
  async run() {
    return { result: await inboxGmailRun() }
  },
})
