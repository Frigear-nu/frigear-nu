export default defineNuxtPlugin({
  setup(nuxtApp) {
    const { clear } = useUserSession()
    const api = $fetch.create({
      onRequest({ options }) {
        const cookieHeader = useRequestHeader('Cookie')
        if (cookieHeader) {
          options.headers.set('Cookie', cookieHeader)
        }
        // FUTURE
        // if (user.value && user.value.accessToken) {
        //   options.headers.set('Authorization', user.value.accessToken)
        // }
      },
      async onResponseError({ response }) {
        if (response.status === 401) {
          await nuxtApp.runWithContext(() => clear())
          await nuxtApp.runWithContext(() => navigateTo('/sign-in'))
        }
      },
    })

    // Expose to useNuxtApp().$api / const { $api } = useNuxtApp()
    return {
      provide: {
        api,
      },
    }
  },
})
