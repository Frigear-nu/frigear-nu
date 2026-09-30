export default eventHandler(async (event) => {
  // Check for JWT, or session from nuxt-auth-utils, simply enrich the context - do not throw...

  event.context.$session = {
    // ...
    type: 'user', // or 'token' -> which resolves a separate entity in the database, e.g. for API keys.
    id: 'user_123',
  }
})
