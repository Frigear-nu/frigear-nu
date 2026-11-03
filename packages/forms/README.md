# @frigear-nu/forms

Dynamic, database-stored forms for the frigear ecosystem. A form is a JSON definition (single page or stepped,
with conditional fields), submissions are stored with a snapshot of the definition they were answered against, and
delivery (email, webhooks, ...) hangs off the `forms:submitted` Nitro hook.

Captcha fields (Cloudflare Turnstile, reCAPTCHA, hCaptcha) need a site key (`NUXT_PUBLIC_FORMS_CAPTCHA_<PROVIDER>_SITE_KEY`)
and a secret key (`NUXT_FORMS_CAPTCHA_<PROVIDER>_SECRET_KEY`) with `<PROVIDER>` one of `TURNSTILE`, `RECAPTCHA`, `HCAPTCHA`;
`NUXT_PUBLIC_FORMS_CAPTCHA_DEFAULT_PROVIDER` picks the provider of a field that names none. A secret key can also be set
per form in the admin builder: it is stored encrypted (AES-256-GCM, key from `NUXT_FORMS_ENCRYPTION_KEY`, else
`NUXT_ENCRYPTION_KEY`, else the session password; changing the key makes stored secrets unreadable) and takes precedence
over the environment one. Without any secret key submissions fail closed.

Embed a published form in Markdown (Nuxt Content / MDC) with the globally registered `FormEmbed` component
(`slug`, `title`, `locale`, `class`; honors the form's access settings):

```md
::form-embed{slug="contact"}
::
```

Full documentation: `apps/docs/content/3.modules/3.features/2.forms/index.md`.

```ts
export default defineNuxtConfig({
  modules: ['@frigear-nu/forms'],
  forms: {
    settings: { pages: { form: true, admin: true, adminForm: true, adminSubmissions: true, adminSubmission: true } },
  },
})
```

```ts
// server/plugins/forms-policy.ts - who may manage forms (denied by default)
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('forms:authorize', (ctx) => { ctx.allowed = isStaff(ctx.userId) })
})
```
