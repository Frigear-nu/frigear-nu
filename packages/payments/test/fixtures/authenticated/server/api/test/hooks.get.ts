import { getHookCalls, resetHookCalls } from '../../plugins/hook-recorder'

export default defineEventHandler((event) => {
  const calls = [...getHookCalls()]
  if (getQuery(event).reset) resetHookCalls()
  return calls
})
