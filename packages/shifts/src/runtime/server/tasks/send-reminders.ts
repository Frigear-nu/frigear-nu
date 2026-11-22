// Sends the shift reminders that are due now (see `shiftsSendReminders`). Runs on `shifts.reminders.cron`; there is no
// request, so the hooks it fires carry `event: undefined`.
export default defineTask({
  meta: {
    name: 'shifts:send-reminders',
    description: 'Email (and optionally text) people before their shifts start.',
  },
  async run() {
    return { result: await shiftsSendReminders() }
  },
})
