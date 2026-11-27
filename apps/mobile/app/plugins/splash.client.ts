// Keeps the splash screen up while the sign-in state is unknown, so the app never shows the public home to someone who
// is signed in (or the other way round) before it knows.
export default defineNuxtPlugin(() => {
  const { status } = useAuth()
  if (status.value !== 'unknown') return
  const release = useMobileSplash().hold()
  const stop = watch(status, (value) => {
    if (value === 'unknown') return
    release()
    stop()
  })
})
