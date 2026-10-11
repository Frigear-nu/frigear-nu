import { appendFile } from 'node:fs/promises'

// Test-only email driver: appends every email as a JSON line to the file named by TEST_MAIL_FILE.
export default async function mailDriver(notification: unknown) {
  await appendFile(process.env.TEST_MAIL_FILE!, `${JSON.stringify(notification)}\n`)
}
