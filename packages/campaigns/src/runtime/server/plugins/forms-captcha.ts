// Only registered when `@frigear-nu/forms` is installed (see `module.ts`): the subscribe route checks its captcha with
// forms' `verifyCaptcha`, so the site and secret keys are the ones forms is configured with.
export default defineNitroPlugin(() => {
  setCampaignsCaptchaVerifier((event, provider, token) => verifyCaptcha(event, provider, token))
})
