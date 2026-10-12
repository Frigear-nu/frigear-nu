// Test-only captcha verification: no network. `good-*` tokens pass, `bad-*` fail, `secret:<value>` passes only when
// the resolved secret key (form secret, else env) equals <value>; anything else falls through to the built-in
// check (which has no secret key for turnstile here and so fails closed).
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('forms:captcha:verify', (ctx) => {
    if (ctx.token.startsWith('good-')) ctx.valid = ctx.provider !== 'hcaptcha' || ctx.token === 'good-hcaptcha'
    else if (ctx.token.startsWith('bad-')) ctx.valid = false
    else if (ctx.token.startsWith('secret:')) ctx.valid = ctx.secretKey === ctx.token.slice('secret:'.length)
  })
})
