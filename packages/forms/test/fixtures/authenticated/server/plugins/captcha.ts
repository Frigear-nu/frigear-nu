// Test-only captcha verification: no network. `good-*` tokens pass, `bad-*` fail, anything else falls
// through to the built-in check (which has no secret key here and so fails closed).
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('forms:captcha:verify', (ctx) => {
    if (ctx.token.startsWith('good-')) ctx.valid = ctx.provider !== 'hcaptcha' || ctx.token === 'good-hcaptcha'
    else if (ctx.token.startsWith('bad-')) ctx.valid = false
  })
})
