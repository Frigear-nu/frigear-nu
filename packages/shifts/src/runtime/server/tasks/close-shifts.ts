// Closes ended shifts (perk grants), marks auto no-shows and sends the leads' digest (see `shiftsCloseShifts`). Runs on
// `shifts.automation.cron`; there is no request, so the hooks it fires carry `event: undefined`.
export default defineTask({
  meta: {
    name: 'shifts:close-shifts',
    description: 'Grant the perks of ended shifts, mark auto no-shows and send the leads their digest.',
  },
  async run() {
    return { result: await shiftsCloseShifts() }
  },
})
