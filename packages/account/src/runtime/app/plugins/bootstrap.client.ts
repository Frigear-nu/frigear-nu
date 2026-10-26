// The account bootstrap belongs to whoever is signed in: forget it (and the entries it primed) when that changes, so
// the next account page loads the new visitor's data.
export default defineNuxtPlugin(() => {
  const { user } = useUserSession()
  watch(() => (user.value as { id?: string | number } | null)?.id ?? null, () => resetBootstrap('account'))
})
