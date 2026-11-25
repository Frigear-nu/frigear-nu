# @frigear-nu/forms

Dynamic, database-stored forms for the frigear ecosystem. A form is a JSON definition (single page or stepped,
with conditional fields), submissions are stored with a snapshot of the definition they were answered against, and
delivery (email, webhooks, ...) hangs off the `forms:submitted` Nitro hook.

Captcha fields (Cloudflare Turnstile, reCAPTCHA, hCaptcha) need a site key (`NUXT_PUBLIC_FORMS_CAPTCHA_<PROVIDER>_SITE_KEY`)
and a secret key (`NUXT_FORMS_CAPTCHA_<PROVIDER>_SECRET_KEY`) with `<PROVIDER>` one of `TURNSTILE`, `RECAPTCHA`, `HCAPTCHA`;
`NUXT_PUBLIC_FORMS_CAPTCHA_DEFAULT_PROVIDER` picks the provider of a field that names none. A secret key can also be set
per form in the admin builder: it is stored encrypted (AES-256-GCM, key derived from `NUXT_APP_SECRET`, or
`NUXT_FORMS_ENCRYPTION_KEY` to use a key of its own; the deprecated `NUXT_ENCRYPTION_KEY` and `NUXT_SESSION_PASSWORD`
still take precedence over `NUXT_APP_SECRET` so existing data stays readable; changing the key makes stored secrets
unreadable) and takes precedence
over the environment one. Without any secret key submissions fail closed.

Embed a published form in Markdown (Nuxt Content / MDC) with the globally registered `FormEmbed` component
(`slug`, `title`, `locale`, `class`; honors the form's access settings):

```md
::form-embed{slug="contact"}
::
```

Full documentation: `apps/docs/content/3.modules/5.features/2.forms/index.md`.

```ts
export default defineNuxtConfig({
  modules: ['@frigear-nu/forms'],
  forms: {
    settings: { pages: { form: true, admin: true, adminForm: true, adminSubmissions: true, adminSubmission: true } },
  },
})
```

```ts
// nuxt.config.ts - who may manage forms: the `admin` role holds `forms:manage`, `forms:pii` and `forms:credentials`
// by default; give them to another role with `authorization.roles`, e.g. { formsmanager: ['forms:manage'] }
// (`forms:*` covers `forms:manage` and `forms:credentials`, never the sensitive `forms:pii`).
```
