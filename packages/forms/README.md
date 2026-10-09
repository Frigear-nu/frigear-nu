# @frigear-nu/forms

Dynamic, database-stored forms for the frigear ecosystem. A form is a JSON definition (single page or stepped,
with conditional fields), submissions are stored with a snapshot of the definition they were answered against, and
delivery (email, webhooks, ...) hangs off the `forms:submitted` Nitro hook.

Full documentation: `apps/docs/content/4.modules/26.forms.md`.

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
