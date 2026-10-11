import type { SeedForm } from '@frigear-nu/forms/utils'

// Ported from the old app's `api/contact.post.ts` + `shared/schema/forms/contact.ts`.
// Recipients come from the environment so no address is hardcoded: NUXT_CONTACT_<SUBJECT> routes a
// subject to its own address, NUXT_MAIL_TO is the fallback. Without a fallback the message is only stored.
export const contactSubjects = {
  volunteering: { da: 'Frivillig', en: 'Volunteering' },
  partnership: { da: 'Samarbejde', en: 'Collaboration' },
  support: { da: 'Support', en: 'Support' },
  payment: { da: 'Betaling', en: 'Payment' },
  governance: { da: 'Bestyrelse', en: 'Board' },
  finance: { da: 'Økonomi', en: 'Finance' },
  complaint: { da: 'Klage', en: 'Complaint' },
  other: { da: 'Andet', en: 'Other' },
} as const

export type ContactSubject = keyof typeof contactSubjects

const addresses = (value: string | undefined) => (value ?? '').split(',').map(email => email.trim()).filter(Boolean)

const fallback = addresses(process.env.NUXT_MAIL_TO)
const routes = Object.fromEntries(
  Object.keys(contactSubjects)
    .map(subject => [subject, addresses(process.env[`NUXT_CONTACT_${subject.toUpperCase()}`])] as const)
    .filter(([, to]) => to.length),
)

export const contactForm: SeedForm = {
  slug: 'contact',
  name: 'Contact',
  status: 'published',
  definition: {
    mode: 'single',
    storage: 'db',
    ...(fallback.length
      ? {
          delivery: {
            email: {
              to: fallback,
              subject: { da: 'Ny henvendelse via frigear.nu', en: 'New message via frigear.nu' },
              ...(Object.keys(routes).length ? { routes: { field: 'subject', to: routes } } : {}),
              replyToField: 'email',
            },
          },
        }
      : {}),
    submit: {
      label: { da: 'Fyr beskeden afsted', en: 'Send message' },
      successMessage: {
        da: 'Vi vender tilbage så snart en frivillig har set den.',
        en: 'We will get back to you as soon as a volunteer has seen it.',
      },
    },
    steps: [{
      id: 'contact',
      fields: [
        { key: 'name', type: 'text', required: true, autocomplete: 'name', label: { da: 'Navn', en: 'Name' }, validation: { maxLength: 120 } },
        { key: 'email', type: 'email', required: true, autocomplete: 'email', label: { da: 'E-mail', en: 'Email' } },
        {
          key: 'phone',
          type: 'tel',
          autocomplete: 'tel',
          label: { da: 'Telefon', en: 'Phone' },
          validation: { pattern: '^\\+\\d{1,3} ?\\d{8,}$', message: { da: 'Ugyldigt telefonnummer.', en: 'Invalid phone number.' } },
        },
        {
          key: 'subject',
          type: 'select',
          required: true,
          label: { da: 'Emne', en: 'Subject' },
          options: Object.entries(contactSubjects).map(([value, label]) => ({ value, label })),
        },
        {
          key: 'subjectOther',
          type: 'text',
          required: true,
          label: { da: 'Andet (uddyb)', en: 'Other (specify)' },
          showIf: { field: 'subject', op: 'eq', value: 'other' },
          validation: { maxLength: 120 },
        },
        { key: 'message', type: 'textarea', required: true, label: { da: 'Besked', en: 'Message' }, validation: { maxLength: 5000 } },
      ],
    }],
  },
}
