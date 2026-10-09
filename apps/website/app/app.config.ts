// Squared, flat look with a hard offset "shade" under elements.
// Shadows use Nuxt UI CSS variables so light/dark mode follow automatically.
const shade = 'shadow-[4px_4px_0_0_var(--ui-border-accented)]'
const shadeLg = 'shadow-[6px_6px_0_0_var(--ui-border-accented)]'
const press = 'transition-all hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5 active:shadow-none'
const shadeColors = ['primary', 'secondary', 'info', 'success', 'warning', 'error'] as const

export default defineAppConfig({
  site: {
    name: 'Frigear.nu',
  },
  socials: {
    instagram: 'https://instagram.com/frigear.nu',
    facebook: 'https://facebook.com/frigear.nu',
    linkedin: 'https://www.linkedin.com/company/frigear',
    youtube: 'https://www.youtube.com/@frigear',
    tiktok: 'https://www.tiktok.com/@frigear.nu',
  },
  github: {
    url: 'https://github.com/Frigear-nu/nuxt-frigear-nu/',
  },
  ui: {
    section: {
      slots: {
        container: 'w-full max-w-(--ui-container) mx-auto px-0 sm:px-3 lg:px-6 flex flex-col lg:grid py-8 sm:py-16 lg:py-24 gap-6 sm:gap-12',
      },
    },
    button: {
      slots: {
        base: `rounded-none font-semibold`,
      },
      compoundVariants: [
        // solid/outline buttons get a shade in their own colour, soft/ghost/link stay flat
        ...shadeColors.flatMap(color => (['solid', 'outline'] as const).map(variant => ({
          color,
          variant,
          class: `shadow-[3px_3px_0_0_var(--ui-${color})] hover:shadow-[4px_4px_0_0_var(--ui-${color})] ${press}`,
        }))),
        { color: 'neutral' as const, variant: 'solid' as const, class: `shadow-[3px_3px_0_0_var(--ui-border-accented)] ${press}` },
        { color: 'neutral' as const, variant: 'outline' as const, class: `${shade} ${press}` },
      ],
    },
    input: { slots: { base: 'rounded-none' } },
    textarea: { slots: { base: 'rounded-none' } },
    select: { slots: { base: 'rounded-none' } },
    selectMenu: { slots: { base: 'rounded-none', content: `rounded-none ${shade}` } },
    badge: { slots: { base: 'rounded-none' } },
    alert: { slots: { root: 'rounded-none' } },
    card: {
      slots: { root: `rounded-none ${shade}` },
      variants: {
        variant: {
          outline: { root: 'ring-2 ring-default' },
        },
      },
    },
    pageCard: {
      slots: { root: `rounded-none ${shade}` },
    },
    modal: {
      slots: { content: `rounded-none ring-2 ring-default ${shadeLg}` },
    },
    popover: {
      slots: { content: `rounded-none ring-2 ring-default ${shade}` },
    },
    dropdownMenu: {
      slots: { content: `rounded-none ring-2 ring-default ${shade}` },
    },
    error: {
      slots: {
        statusCode: 'text-7xl sm:text-9xl font-black tracking-tighter text-primary [text-shadow:6px_6px_0_var(--ui-border-accented)]',
        statusMessage: 'font-extrabold tracking-tight',
        links: 'mt-10 flex items-center justify-center gap-6',
      },
    },
    pageHero: {
      slots: {
        title: 'text-4xl sm:text-7xl text-pretty tracking-tight font-bold text-highlighted',
        container: 'w-full max-w-(--ui-container) mx-auto px-2 sm:px-4 lg:px-6 flex flex-col lg:grid py-12 sm:py-16 lg:py-24 gap-12 sm:gap-y-10',
      },
    },
    colors: {
      primary: 'violet',
      secondary: 'indigo',
      tertiary: 'amber',
      info: 'teal',
      neutral: 'slate',
      success: 'green',
      warning: 'amber',
      error: 'red',
    },
    collapsible: {
      slots: {
        root: '',
        content: 'data-[state=open]:animate-[collapsible-down_300ms_ease-in-out] data-[state=closed]:animate-[collapsible-up_400ms_ease-in-out] overflow-hidden',
      },
    },
  },
  autoForm: {
    submit: false,
  },
})
