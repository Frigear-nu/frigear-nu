// `?hold=3000` keeps the splash screen up for 3 s, as an app waiting on its first fetch would.
export default defineNuxtPlugin(() => {
  const ms = Number(new URL(window.location.href).searchParams.get('hold'))
  if (ms > 0) useMobileSplash().waitFor(new Promise(resolve => setTimeout(resolve, ms)))
})
