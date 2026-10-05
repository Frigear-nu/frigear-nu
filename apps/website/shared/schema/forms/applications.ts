// shared/schema/forms/applications.ts

import { z } from 'zod/v4'
import type { UnionFormSteps } from '#shared/types/form'
import { defineSteppedForm } from '#shared/form'

const acceptTerms = z.literal(true).meta({
  type: 'checkbox',
  title: '', // empty string means no label
  description: 'steppedForm.acceptTerms.description',
})

export const projectApplicationForm = defineSteppedForm({
  id: 'application',
  steps: [
    {
      id: 'info',
      schema: z.object({
        description: z.string().optional().meta({
          type: 'markdown-value',
          content: {
            da: `
::u-page-section
---
class: py-0
ui:
  container: py-0 sm:py-0 lg:py-0
  title: text-3xl sm:text-4xl lg:text-5xl
---
#title
Sådan ansøger du om Frigear projektstøtte :money_with_wings:

#description
Hvis dit projekt har flere dele der kan støttes med forskellige budgetter for at komme i luften, kan i udfylde formularen for det samlede projekt først – og til sidst vil du have mulighed for at vælge at ansøge om delelementer af projektet. :br :br
 *_Det gør det nemmere for vores medlemmer at støtte med en andel hvis det fulde beløb ikke kan akkommoderes._
 
::accordion
---
ui:
  root: mx-8 text-left
---
  :::accordion-item{label="Ansøgningseksempler" icon="i-lucide-info"}
 
  ### Forskellige budgetter for samme slutmål:
  >_Vi vil bygge et komplet skatepark til vores hood..._
  
  **_Første ansøgning..._** :br
  **1.** - Fuld skatepark – Budget: 350k :br :br
  **_Endnu en ansøgning..._** :br
  **2.** - Én halfpipe-rampe – Budget: 25k :br :br
  **_Yderligere en ansøgning..._** :br
  **3.** - Køb 5 rails – Budget: 5k
  :::
::
::
`,
            // ENGLISH:
            en: `
::u-page-section
---
class: py-0 sm:py-2 sm:px-0
ui:
  container: py-0 sm:py-0 lg:py-0
  title: text-3xl sm:text-4xl lg:text-5xl
---
#title
How to apply for Frigear project funding :money_with_wings:

#description
If your project has multiple parts that can be supported individually, to get it flying, -you can run through the form and submit the application for full funding, and at the end you will have the option to apply again for smaller parts of the budget under same project. :br :br
*_This makes it easier for our members to support you in case the full amount cannot be accommodated._

::accordion
---
ui:
  root: mx-12 text-left
---
:::accordion-item{label="Application Examples" icon="i-lucide-info"}

### Different budgets for the same endgoal:
>_We want to build a complete skatepark for our community..._

**_First Application_** :br
**1.** - Full skatepark - Budget: 350k :br :br
**_Another Application_** :br
**2.** - One halfpipe ramp - Budget: 25k :br :br
  **_Yet Another Application_** :br
**3.** - Buy 5 rails - Budget: 5k
:::
::
::
`,
          },
        }),
      }),
    },
    {
      id: 'contactInfo',
      icon: 'i-lucide-book-text',
      labelKey: 'form.application.contactInfo.label',
      hint: {
        da: 'Det her er for detaljer om dig som sender ansøgningen.',
        en: 'This step is for personal details about the person submitting the application.',
      },
      schema: z.object({
        fullName: z.string().meta({
          autocomplete: 'name',
          hint: {
            da: 'Dit fulde navn',
            en: 'Your full name',
          },
        }),
        email: z.email().meta({
          hint: {
            en: 'Your awesome email here.',
            da: 'Din frække email her.',
          },
        }),
        phone: z.string().optional(),
      }),
    },
    {
      id: 'organizationInfo',
      schema: z.object({
        organizationName: z.string(),
        organizationNumber: z.string(),
        organizationAddressStreet: z.string().meta({
          autocomplete: 'street-address',
        }),
        organizationAddressCo: z.string().optional().meta({
          hint: {
            en: 'If mailbox doesn´t hold the org. name',
            da: 'Hvis jeres org. navn ikke fremgår af postkassen.',
          },
        }),
        organizationAddressPostcode: z.string().meta({
          autocomplete: 'postal-code',
        }),
        organizationAddressCity: z.string(),
        accountableParties: z.string().meta({
          hint: {
            en: 'Write all relevant responsible indivuals names here',
            da: 'Skriv alle seje individers navne der er ansvarlige for organisationen her.',
          },
          type: 'textarea',
        }),
        organizationEmail: z.email(),
        organizationPhone: z.string().optional(),
      }),
    },
    {
      id: 'organizationAbout',
      schema: z.object({
        organizationAbout: z.string().meta({
          hint: {
            en: 'Write some awesome stuff about your organization that will intrique our members to support you.',
            da: 'Skriv noget mega fedt om jeres organisation her, så vores medlemmer får lyst til at støtte netop jeres formål.',
          },
          type: 'textarea',
        }),
        organizationWebsite: z.string().optional().meta({
          autocomplete: 'url',
        }),
        organizationFacebook: z.string().optional(),
        organizationInstagram: z.string().optional(),
        organizationTikTok: z.string().optional(),
        organizationYouTube: z.string().optional(),
        organizationLinkedIn: z.string().optional(),
      }),
    },
    {
      id: 'financialInfo',
      schema: z.object({
        bankName: z.string(),
        regNr: z.string().length(4),
        accountNumber: z.string(),
        annualBudget: z.number(),
        ownContribution: z.number(),
        paidStaffAmount: z.number().meta({
          hint: {
            da: 'Fastansat personale i jeres org.',
            en: 'Full time employees on your org. payroll.',
          },
        }),
        financialPatrons: z.string().meta({
          hint: {
            en: 'Is your project funded from other parties, and what parts?',
            da: 'Er jeres projekt støttet fra andre sider, -og hvilke dele dækker de?',
          },
          type: 'textarea',
        }),
      }),
    },
    {
      id: 'branding',
      schema: z.object({
        logo: z.array(z.file()).meta({
          type: 'file',
          multiple: true,
          // TODO: Make single file input work in a "slim" variant
          // variant: 'slim',
          // multiple: false,
        }),
        relevantImages: z.array(z.file()).meta({
          type: 'file',
          multiple: true,
        }),
        threeLineOrgPitch: z.string().meta({
          type: 'textarea',
        }),
        otherMedia: z.array(z.file())
          .optional()
          .meta({
            type: 'file',
            multiple: true,
          }),
        acceptTerms,
      }),
    },
  ],
})

export type ProjectApplicationForm = UnionFormSteps<typeof projectApplicationForm['steps']>

export const boardMemberApplicationForm = defineSteppedForm({
  id: 'board-member-application',
  steps: [
    {
      id: 'background',
      icon: 'i-lucide-book-text',
      schema: z.object({
        fullName: z.string().meta({
          autocomplete: 'name',
          hint: {
            da: 'Dit fulde navn',
            en: 'Your full name',
          },
        }),
        email: z.email().meta({
          hint: {
            en: 'Your awesome email here.',
            da: 'Din frække email her.',
          },
        }),
        phone: z.string().optional(),
        background: z.string().meta({
          type: 'textarea',
        }),
        attachments: z.array(z.instanceof(File))
          .meta({
            type: 'file',
            multiple: true,
          }),
        acceptTerms,
      }),
    },
  ],
})

// Test form
export const testApplicationForm = defineSteppedForm({
  id: 'test',
  steps: [
    {
      id: 'first',
      icon: 'i-lucide-book-text',
      labelKey: '**HELLO**',
      hint: {
        icon: 'i-lucide-book-text',
        content: 'This is the [MARKDOWN]{.text-primary} description of this step!',
      },
      schema: z.object({
        other: z.string().meta({
          // you can use i18n manually
          // title: 'form.application.background',
          type: 'textarea',
          placeholder: 'enter some text',
        }),
      }),
    },
    {
      id: 'finish',
      labelKey: 'FINISHED',
      schema: z.object({
        files: z.array(z.file()).meta({
          type: 'file',
          multiple: true,
        }),
        acceptTerms,
      }),
    },
  ],
})
