export default defineTask({
  meta: {
    name: 'test',
  },
  async run() {
    console.log('Running test task...')
    await dispatchEmailNotification({
      to: 'test@example.com',
      subject: 'Test Email',
      body: 'This is a test email notification.',
    })
    return { result: 'Done running test task and sending test email notification.' }
  },
})
