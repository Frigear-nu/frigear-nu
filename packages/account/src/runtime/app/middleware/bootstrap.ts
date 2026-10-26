import { keys } from '#account/bootstrap'

// Runs on every account page (a route rule of the area), before the page's components set up, on the server and on
// each client navigation: one request loads what the modules registered for the `account` scope and primes their
// `useCachedFetch` entries, so `useMyTickets()`, `useSubscription()`, ... render without a request of their own.
// A layout cannot do this: it sets up once and stays mounted while the visitor moves between account pages.
export default defineNuxtRouteMiddleware(async () => {
  if (!keys.length || !useUserSession().loggedIn.value) return
  await loadBootstrap('account')
})
