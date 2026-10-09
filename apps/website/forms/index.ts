import type { SeedForm } from '@frigear-nu/forms/utils'

// Ported from the old app's `content/forms` + `shared/schema/forms/applications.ts` + locale files.
// Recipients come from the environment so no address is hardcoded; without it submissions are
// only stored (and handed to `forms:submitted` listeners).
const recipients = (process.env.NUXT_FORMS_APPLICATIONS_TO ?? '').split(',').map(email => email.trim()).filter(Boolean)
const delivery = recipients.length ? { email: { to: recipients } } : undefined

export const projectApplicationForm: SeedForm = {
  slug: 'project-application',
  name: 'Project funding application',
  status: 'draft',
  definition: {
    mode: 'stepped',
    storage: 'db',
    ...(delivery ? { delivery } : {}),
    steps: [
      {
        id: 'info',
        fields: [
          {
            key: 'infoText',
            type: 'markdown',
            content: {
              da: '**Sådan ansøger du om Frigear projektstøtte** 💸\n\nHvis dit projekt har flere dele der kan støttes med forskellige budgetter for at komme i luften, kan I udfylde formularen for det samlede projekt først – og til sidst vil du have mulighed for at ansøge om delelementer af projektet. _Det gør det nemmere for vores medlemmer at støtte med en andel hvis det fulde beløb ikke kan akkommoderes._\n\n**Eksempel – forskellige budgetter for samme slutmål**\n\n_Vi vil bygge en komplet skatepark til vores hood..._\n\n1. Fuld skatepark – budget: 350k\n\n2. Én halfpipe-rampe – budget: 25k\n\n3. Køb 5 rails – budget: 5k',
              en: '**How to apply for Frigear project funding** 💸\n\nIf your project has multiple parts that can be supported individually, you can run through the form and submit the application for full funding, and at the end you will have the option to apply again for smaller parts of the budget under the same project. _This makes it easier for our members to support you in case the full amount cannot be accommodated._\n\n**Example – different budgets for the same end goal**\n\n_We want to build a complete skatepark for our community..._\n\n1. Full skatepark – budget: 350k\n\n2. One halfpipe ramp – budget: 25k\n\n3. Buy 5 rails – budget: 5k',
            },
          },
        ],
      },
      {
        id: 'contactInfo',
        title: {
          da: 'Kontakt information',
          en: 'Contact info',
        },
        description: {
          da: 'Det her er for detaljer om dig som sender ansøgningen.',
          en: 'This step is for personal details about the person submitting the application.',
        },
        fields: [
          {
            key: 'fullName',
            type: 'text',
            required: true,
            label: {
              da: 'Fuldt navn',
              en: 'Full name',
            },
            placeholder: {
              da: 'Hej, hva hedder du?',
              en: 'Hei, What\'s your name?',
            },
            autocomplete: 'name',
          },
          {
            key: 'email',
            type: 'email',
            required: true,
            label: {
              da: 'E-mail',
              en: 'E-mail',
            },
            placeholder: {
              da: 'megasnazzyme(at)some.lol',
              en: 'megasnazzyme(at)some.lol',
            },
            autocomplete: 'email',
          },
          {
            key: 'phone',
            type: 'tel',
            label: {
              da: 'Dit eget fonnummer',
              en: 'Phone',
            },
            placeholder: {
              da: '66666666',
              en: '66666666',
            },
          },
        ],
      },
      {
        id: 'organizationInfo',
        title: {
          da: 'Information om jeres organisation',
          en: 'Information about your organization',
        },
        fields: [
          {
            key: 'organizationName',
            type: 'text',
            required: true,
            label: {
              da: 'Organisationens navn',
              en: 'Org. name',
            },
            placeholder: {
              da: 'Mega lækkert org-navn her...',
              en: 'Mega hot org-name',
            },
          },
          {
            key: 'organizationNumber',
            type: 'text',
            required: true,
            label: {
              da: 'CVR. Nr:',
              en: 'Organization number',
            },
          },
          {
            key: 'organizationAddressStreet',
            type: 'text',
            required: true,
            label: {
              da: 'Adresse',
              en: 'Address',
            },
            autocomplete: 'street-address',
          },
          {
            key: 'organizationAddressCo',
            type: 'text',
            label: {
              da: 'C/O',
              en: 'C/O',
            },
            description: {
              da: 'Evt. C/O, eller Att: person.',
              en: 'Potential C/O address, or Att: person',
            },
            placeholder: {
              da: 'Att: Sorte Slyngel...',
              en: 'Att: Jane Doe...',
            },
          },
          {
            key: 'organizationAddressPostcode',
            type: 'text',
            required: true,
            label: {
              da: 'Postnummer',
              en: 'Zipcode',
            },
            placeholder: {
              da: '6666',
              en: '6666',
            },
            autocomplete: 'postal-code',
          },
          {
            key: 'organizationAddressCity',
            type: 'text',
            required: true,
            label: {
              da: 'By',
              en: 'City',
            },
            placeholder: {
              da: 'Snævren By',
              en: 'Small Town',
            },
          },
          {
            key: 'accountableParties',
            type: 'textarea',
            required: true,
            label: {
              da: 'Ansvarlige personer',
              en: 'Accountable persons',
            },
            placeholder: {
              da: 'Søren Banjomus: banjo(at)mus.lol ... \nSorte Slyngel: ... \nAnden: ...',
              en: 'Jane Doe: jane(at)example.com ...\nJohn Doe: ...\nOther: ...',
            },
          },
          {
            key: 'organizationEmail',
            type: 'email',
            required: true,
            label: {
              da: 'E-mail',
              en: 'E-mail',
            },
            placeholder: {
              da: 'cool-name(at)hot-org.lol ...',
              en: 'cool-name(at)hot-org.lol ...',
            },
          },
          {
            key: 'organizationPhone',
            type: 'tel',
            label: {
              da: 'Fonnummer',
              en: 'Phone',
            },
            placeholder: {
              da: '42666642',
              en: '42666642',
            },
          },
        ],
      },
      {
        id: 'organizationAbout',
        title: {
          da: 'Om organisationen',
          en: 'About the organisation',
        },
        fields: [
          {
            key: 'organizationAbout',
            type: 'textarea',
            required: true,
            label: {
              da: 'Om jeres organisation',
              en: 'About organization',
            },
            description: {
              da: 'Skriv lidt om jer og jeres organisations formål m.v.',
              en: 'Write a little about what the purpose and mission of your organization is',
            },
            placeholder: {
              da: 'Hej, vi er xxx, -og vi laver faldskærme af restplast som ...',
              en: 'Hi, we are xxx, and we make parachutes from leftover plastic ...',
            },
          },
          {
            key: 'organizationWebsite',
            type: 'text',
            label: {
              da: 'Hjemmeside',
              en: 'Website',
            },
            autocomplete: 'url',
          },
          {
            key: 'organizationFacebook',
            type: 'text',
            label: {
              da: 'Facebook',
              en: 'Facebook',
            },
          },
          {
            key: 'organizationInstagram',
            type: 'text',
            label: {
              da: 'Instagram',
              en: 'Instagram',
            },
          },
          {
            key: 'organizationTikTok',
            type: 'text',
            label: {
              da: 'TikTok',
              en: 'TikTok',
            },
          },
          {
            key: 'organizationYouTube',
            type: 'text',
            label: {
              da: 'YouTube',
              en: 'YouTube',
            },
          },
          {
            key: 'organizationLinkedIn',
            type: 'text',
            label: {
              da: 'LinkedIn',
              en: 'LinkedIn',
            },
          },
        ],
      },
      {
        id: 'financialInfo',
        title: {
          da: 'Økonomi',
          en: 'Finances',
        },
        fields: [
          {
            key: 'bankName',
            type: 'text',
            required: true,
            label: {
              da: 'Banknavn',
              en: 'Bank name',
            },
          },
          {
            key: 'regNr',
            type: 'text',
            required: true,
            label: {
              da: 'Reg. Nr.',
              en: 'Reg. Nr.',
            },
            validation: {
              minLength: 4,
              maxLength: 4,
            },
          },
          {
            key: 'accountNumber',
            type: 'text',
            required: true,
            label: {
              da: 'Kontonummer',
              en: 'Account number',
            },
          },
          {
            key: 'annualBudget',
            type: 'number',
            required: true,
            label: {
              da: 'Årligt org. budget',
              en: 'Annual budget',
            },
            description: {
              da: 'Jeres samlede budget for hele organisationen.',
              en: 'The entire annual budget of your organization',
            },
            validation: {
              min: 0,
            },
          },
          {
            key: 'ownContribution',
            type: 'number',
            required: true,
            label: {
              da: 'Eget bidrag',
              en: 'Own contribution',
            },
            description: {
              da: 'Hvor meget tænker i selv at lægge af midler i projektet?',
              en: 'How much do you intend to bring to the table for the project yourselves?',
            },
            validation: {
              min: 0,
            },
          },
          {
            key: 'paidStaffAmount',
            type: 'number',
            required: true,
            label: {
              da: 'Lønnede ansatte?',
              en: 'Paid staff?',
            },
            description: {
              da: 'Har jeres org. faste månedslønnede ansatte?',
              en: 'Does your org. have monthly paid, year round staff?',
            },
            placeholder: {
              da: '0',
              en: '0',
            },
            validation: {
              min: 0,
            },
          },
          {
            key: 'financialPatrons',
            type: 'textarea',
            required: true,
            label: {
              da: 'Andre bidragsydere til projektet',
              en: 'Other financial patrons?',
            },
            description: {
              da: 'Er projektet yderligere støttet af midler fra andre?',
              en: 'Is parts of the project funded from other parties?',
            },
            placeholder: {
              da: 'Ja, da . . . Min moster smider tusind dask . . ',
              en: 'Yes, since . . . My aunt chips in a thousand . .',
            },
          },
        ],
      },
      {
        id: 'branding',
        title: {
          da: 'Profil og materiale',
          en: 'Branding',
        },
        fields: [
          {
            key: 'logo',
            type: 'file',
            required: true,
            label: {
              da: 'Logo(er)',
              en: 'Logo(s)',
            },
            multiple: true,
            validation: {
              accept: [
                'image/*',
                'application/pdf',
              ],
            },
          },
          {
            key: 'relevantImages',
            type: 'file',
            required: true,
            label: {
              da: 'Relevante billeder',
              en: 'Relevant images',
            },
            multiple: true,
            validation: {
              accept: [
                'image/*',
              ],
            },
          },
          {
            key: 'threeLineOrgPitch',
            type: 'textarea',
            required: true,
            label: {
              da: 'Jeres vildt fede projekt-pitch',
              en: '3-line project pitch',
            },
          },
          {
            key: 'otherMedia',
            type: 'file',
            label: {
              da: 'Andet materiale',
              en: 'Other media files',
            },
            multiple: true,
          },
          {
            key: 'termsInfo',
            type: 'markdown',
            content: {
              da: 'Jeg har læst og accepterer Frigears [betingelser](https://frigear.nu/legal/terms) og [privatlivspolitik](https://frigear.nu/legal/gdpr).',
              en: 'I have read and accept Frigear\'s [Terms & Conditions](https://frigear.nu/legal/terms) and [Privacy Policy](https://frigear.nu/legal/gdpr).',
            },
          },
          {
            key: 'acceptTerms',
            type: 'checkbox',
            required: true,
            label: {
              da: 'Jeg accepterer',
              en: 'I accept',
            },
          },
        ],
      },
    ],
    submit: {
      allowResubmit: {
        keep: [
          'fullName',
          'email',
          'phone',
          'organizationName',
          'organizationNumber',
          'organizationAddressStreet',
          'organizationAddressCo',
          'organizationAddressPostcode',
          'organizationAddressCity',
          'accountableParties',
          'organizationEmail',
          'organizationPhone',
          'organizationAbout',
          'organizationWebsite',
          'organizationFacebook',
          'organizationInstagram',
          'organizationTikTok',
          'organizationYouTube',
          'organizationLinkedIn',
          'bankName',
          'regNr',
          'accountNumber',
          'financialPatrons',
        ],
      },
    },
  },
}

export const boardMemberApplicationForm: SeedForm = {
  slug: 'board-member-application',
  name: 'Board member application',
  status: 'draft',
  definition: {
    mode: 'stepped',
    storage: 'db',
    ...(delivery ? { delivery } : {}),
    steps: [
      {
        id: 'background',
        title: {
          da: 'Kontakt information',
          en: 'Contact info',
        },
        description: {
          da: 'Om dig, der smækker ansøgningen afsted',
          en: 'About you who is applying',
        },
        fields: [
          {
            key: 'fullName',
            type: 'text',
            required: true,
            label: {
              da: 'Fuldt navn',
              en: 'Full name',
            },
            placeholder: {
              da: 'Hej, hva hedder du?',
              en: 'Hey, what\'s your name?',
            },
            autocomplete: 'name',
          },
          {
            key: 'email',
            type: 'email',
            required: true,
            label: {
              da: 'E-mail',
              en: 'E-mail',
            },
            placeholder: {
              da: 'megasnazzyme(at)some.lol',
              en: 'megasnazzyme(at)some.lol',
            },
            autocomplete: 'email',
          },
          {
            key: 'phone',
            type: 'tel',
            label: {
              da: 'Dit eget fonnummer',
              en: 'Phone',
            },
            placeholder: {
              da: '66666666',
              en: '66666666',
            },
          },
          {
            key: 'background',
            type: 'textarea',
            required: true,
            label: {
              da: 'Din bagrund..',
              en: 'Background',
            },
          },
          {
            key: 'attachments',
            type: 'file',
            label: {
              da: 'Filer, CV...',
              en: 'Files, CV...',
            },
            multiple: true,
          },
          {
            key: 'termsInfo',
            type: 'markdown',
            content: {
              da: 'Jeg har læst og accepterer Frigears [betingelser](https://frigear.nu/legal/terms) og [privatlivspolitik](https://frigear.nu/legal/gdpr).',
              en: 'I have read and accept Frigear\'s [Terms & Conditions](https://frigear.nu/legal/terms) and [Privacy Policy](https://frigear.nu/legal/gdpr).',
            },
          },
          {
            key: 'acceptTerms',
            type: 'checkbox',
            required: true,
            label: {
              da: 'Jeg accepterer',
              en: 'I accept',
            },
          },
        ],
      },
    ],
  },
}
