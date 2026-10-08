import { getFakeStripeCalls, resetFakeStripeCalls } from '../../plugins/fake-stripe'

export default defineEventHandler((event) => {
  const calls = [...getFakeStripeCalls()]
  if (getQuery(event).reset) resetFakeStripeCalls()
  return calls
})
