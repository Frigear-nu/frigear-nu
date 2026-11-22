import { getFakeProviderCalls, resetFakeProviderCalls } from '../../plugins/fake-providers'

export default defineEventHandler((event) => {
  const calls = [...getFakeProviderCalls()]
  if (getQuery(event).reset) resetFakeProviderCalls()
  return calls
})
