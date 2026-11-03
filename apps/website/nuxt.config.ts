// https://nuxt.com/docs/api/configuration/nuxt-config
import { boardMemberApplicationForm, projectApplicationForm } from './forms'
import { contactForm } from './forms/contact'

// The public URL, when the build knows it: the deployment host or an explicit NUXT_SITE_URL. Otherwise (PR previews,
// local builds) `site.url` stays unset and canonical and hreflang URLs come from the request origin.
const knownSiteUrl = process.env.NUXT_SITE_URL
  || (process.env.DEPLOYMENT_HOST ? `https://${process.env.DEPLOYMENT_HOST}` : undefined)

export default defineNuxtConfig({
  extends: ['@frigear-nu/base'],
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxthub/core',
    '@nuxt/content',
    '@nuxtjs/i18n',
    '@nuxtjs/device',
    '@pinia/nuxt',
    '@pinia/colada-nuxt',
    'nuxt-qrcode',
    '@frigear-nu/ui',
    '@frigear-nu/menu',
    '@frigear-nu/auth',
    '@frigear-nu/users',
    '@frigear-nu/authorization',
    '@frigear-nu/widget',
    '@frigear-nu/admin',
    '@frigear-nu/account',
    '@frigear-nu/notify',
    '@frigear-nu/email-templates',
    '@frigear-nu/stripe',
    '@frigear-nu/subscriptions',
    '@frigear-nu/payments',
    '@frigear-nu/events',
    '@frigear-nu/forms',
    '@frigear-nu/cookie-consent',
    '@frigear-nu/oauth-server',
    '@frigear-nu/preferences',
  ],

  $development: {
    content: {
      experimental: {
        sqliteConnector: 'native',
      },
    },
  },

  $production: {
    hub: {
      db: {
        dialect: 'sqlite',
        driver: 'd1',
        connection: {
          // Possible to override...
          databaseId: process.env.NUXT_HUB_CLOUDFLARE_DATABASE_ID || 'c0dbc11f-1a2d-4cf8-b520-9a150261a51a',
        },
        applyMigrationsDuringBuild: false,
      },
      // KV is used by @frigear-nu/stripe (webhook idempotency) and @frigear-nu/subscriptions (plans cache).
      // `namespaceId` makes NuxtHub add the `KV` binding to the generated wrangler.json.
      kv: {
        driver: 'cloudflare-kv-binding',
        binding: 'KV',
        namespaceId: process.env.NUXT_HUB_CLOUDFLARE_KV_NAMESPACE_ID,
      },
      // Blob (R2) is used by @frigear-nu/forms for submission file uploads.
      blob: {
        driver: 'cloudflare-r2',
        binding: 'BLOB',
        bucketName: process.env.NUXT_HUB_CLOUDFLARE_BUCKET_NAME,
      },
    },
  },

  devtools: {
    enabled: true,
  },

  css: ['~/assets/css/main.css'],

  // Only the production custom domain is indexable: PR previews and *.workers.dev hosts are `noindex`/Disallow: /.
  site: {
    name: 'Frigear.nu',
    ...(knownSiteUrl && { url: knownSiteUrl }),
    indexable: !!process.env.DEPLOYMENT_HOST
      && !process.env.DEPLOYMENT_HOST.endsWith('.workers.dev')
      && !process.env.PR_NUMBER,
  },
  runtimeConfig: {
    // Comma separated emails allowed to manage OAuth applications (NUXT_OAUTH_ADMIN_EMAILS).
    oauthAdminEmails: '',
    // Comma separated emails allowed to manage forms and read submissions (NUXT_FORMS_ADMIN_EMAILS).
    formsAdminEmails: '',
    // Comma separated emails that are always admins (NUXT_ACL_ADMINS). Bootstraps the first admin.
    aclAdmins: '',
    // PR previews (NUXT_PREVIEW_DEPLOYMENT overrides). Enables "Log in with frigear.nu" without credentials in config.
    previewDeployment: !!process.env.PR_NUMBER,
    frigear: {
      // Log in with frigear.nu (OIDC): FRIGEAR_SSO_URL / FRIGEAR_SSO_CLIENT_ID / FRIGEAR_SSO_CLIENT_SECRET.
      sso: {
        url: process.env.FRIGEAR_SSO_URL || '',
        clientId: process.env.FRIGEAR_SSO_CLIENT_ID || '',
        clientSecret: process.env.FRIGEAR_SSO_CLIENT_SECRET || '',
      },
      // Use the frigear.nu user id as the local user id (NUXT_FRIGEAR_FORCE_ID).
      forceId: false,
    },
  },

  routeRules: {
    // A prerendered page has no request to take its URL from, so only prerender when the site URL is known.
    '/': { prerender: !!knownSiteUrl },
  },

  compatibilityDate: '2026-06-30',

  // .nitro @ defaults
  nitro: {
    cloudflare: {
      deployConfig: true,
      nodeCompat: true,
      // Sets fields in the generated wrangler.json
      wrangler: {
        keep_vars: true,
        observability: {
          enabled: true,
          logs: {
            enabled: true,
          },
        },
        // Lets the deploy workflows pin the worker name (e.g. to keep PR
        // preview versions on the same worker as production) without
        // hardcoding it here.
        name: process.env.CLOUDFLARE_WORKER_NAME || undefined,
        // Lets the deploy workflows pin the worker routes (e.g. to keep PR
        // preview versions on the same worker as production) without
        // hardcoding it here ona custom domain. If no custom domain is set, the default worker subdomain/domain will be used.
        // If no DEPLOYMENT_HOST is provided, it will be assigned a *.workers.dev subdomain.
        // Without a custom domain, serve the Worker (and its Previews) on *.workers.dev.
        // `wrangler preview` only reports a URL when workers.dev or `previews_enabled` is on.
        workers_dev: !process.env.DEPLOYMENT_HOST || process.env.DEPLOYMENT_HOST.endsWith('.workers.dev'),
        preview_urls: true,
        routes: process.env.DEPLOYMENT_HOST
          ? [{
              pattern: process.env.DEPLOYMENT_HOST,
              custom_domain: !(process.env?.DEPLOYMENT_HOST?.endsWith('.workers.dev')),
              // Also serve Worker Previews (`wrangler preview --name pr-<n>`) on pr-<n>.<DEPLOYMENT_HOST>.
              // Only applied by a production `wrangler deploy`; ignored for workers.dev hosts.
              ...(process.env.DEPLOYMENT_HOST.endsWith('.workers.dev') ? {} : { previews_enabled: true }),
            }]
          : undefined,
        // Worker Previews (https://developers.cloudflare.com/workers/previews/) do NOT inherit production
        // bindings, and the block is required for `wrangler preview` to work. A PR build sets
        // NUXT_HUB_CLOUDFLARE_DATABASE_ID to the per-PR D1 database, so Previews are isolated from production.
        // KV/R2 point at the configured resources; use dedicated preview ones via the same env vars if needed.
        // Secrets/vars: `wrangler preview base-config secret put <NAME>` (set once, copied to each new Preview).
        previews: {
          ...(process.env.NUXT_HUB_CLOUDFLARE_DATABASE_ID && {
            d1_databases: [{
              binding: 'DB',
              database_name: `pr-${process.env.PR_NUMBER}-${process.env.CLOUDFLARE_DB_NAME}-preview`,
              database_id: process.env.NUXT_HUB_CLOUDFLARE_DATABASE_ID,
            }],
          }),
          ...(process.env.NUXT_HUB_CLOUDFLARE_KV_NAMESPACE_ID && {
            kv_namespaces: [{ binding: 'KV', id: process.env.NUXT_HUB_CLOUDFLARE_KV_NAMESPACE_ID }],
          }),
          ...(process.env.NUXT_HUB_CLOUDFLARE_BUCKET_NAME && {
            r2_buckets: [{ binding: 'BLOB', bucket_name: process.env.NUXT_HUB_CLOUDFLARE_BUCKET_NAME }],
          }),
        },
      },
    },
  },

  // .hub @ defaults
  hub: {
    kv: true,
    blob: true,
    db: {
      dialect: 'sqlite',
      casing: 'snake_case',
      driver: 'libsql',
      connection: { url: 'file:./.data/db/sqlite.db' },
    },
  },

  hooks: {
    // nitropack 2 bundles `scheduledTasks` into the worker's `scheduled` handler but never writes the cron
    // expressions to wrangler.json, so Cloudflare has nothing to trigger. Mirror them into `triggers.crons`.
    'nitro:init': (nitro) => {
      const crons = Object.keys(nitro.options.scheduledTasks || {})
      if (!crons.length || !nitro.options.preset.startsWith('cloudflare')) return
      const wrangler = ((nitro.options.cloudflare ||= {}).wrangler ||= {})
      wrangler.triggers = { ...wrangler.triggers, crons: [...new Set([...(wrangler.triggers?.crons ?? []), ...crons])] }
    },
  },
  account: {
    settings: {
      pages: { index: true, profile: true, security: true, documents: true, apiTokens: true },
      // Ported from the old `account/documents.vue`. `roles` only decides what is listed: the files are static
      // assets under public/, so anyone with the URL can fetch them (as before).
      documents: [
        { id: 'handbook', label: { da: 'Frivillig Håndbog', en: 'Volunteer Handbook' }, path: '/assets/files/Frivillig håndbog.docx' },
        { id: 'ba-folder', label: { da: 'BA-mappe', en: 'BA folder' }, path: '/assets/files/BA-mappe.pdf', roles: ['admin', 'manager', 'coordinator', 'eventmanager', 'barmanager', 'crew'] },
        { id: 'shift-overview', label: 'Vagtoversigt', path: '/assets/files/Vagtoversigt.pdf', roles: ['admin', 'manager', 'coordinator', 'eventmanager', 'barmanager', 'crew'] },
        { id: 'ba-coordinator-meeting', label: { da: 'BA Koordinatormøde 25.03.2026', en: 'BA coordinator meeting 25.03.2026' }, path: '/assets/files/BA-Koordinatormøde-2503-2026.docx', roles: ['admin', 'manager', 'coordinator', 'eventmanager', 'barmanager', 'crew'] },
      ],
    },
  },
  admin: {
    settings: {
      // Same roles as the old `canViewAdminArea` ability.
      roles: ['admin', 'manager', 'coordinator'],
    },
  },
  authentication: {
    settings: {
      afterLogin: '/account',
      // Production accounts are created on frigear.nu itself; previews and local dev keep the local register page.
      pages: {
        login: '/sign-in',
        register: process.env.NODE_ENV === 'production' && !process.env.PR_NUMBER ? 'https://frigear.nu/sign-up' : '/sign-up',
      },
      password: true,
      webAuthn: true,
      // Passwordless sign-in links; following one also verifies the address. Unknown addresses do not get
      // an account (use the register page). Email/password users must verify before logging in.
      magicLink: true,
      verifyEmail: true,
      session: { mapper: '~~/server/utils/map-session-user' },
      // Facebook (like any other nuxt-auth-utils provider) is offered once its credentials are set at runtime:
      // NUXT_OAUTH_FACEBOOK_CLIENT_ID / NUXT_OAUTH_FACEBOOK_CLIENT_SECRET.
      // frigear: "Log in with frigear.nu", only active on previews or when `runtimeConfig.frigear.sso` is set.
      oauth: { frigear: true },
    },
  },
  authorization: {
    // Guests on a guarded page (e.g. /account/**) are sent to the login page instead of a 401 error.
    redirectTo: '/sign-in',
  },
  cookieConsent: {
    policyUrl: '/legal/gdpr',
  },
  // Renders module emails (auth, users, subscriptions) from their Vue templates; without it notify sends plain HTML.
  emailTemplates: {
    brandName: 'Frigear.nu',
    logoUrl: '/logo.png',
    // Mail clients need an absolute logo URL, so local dev borrows the production one.
    siteUrl: `https://${process.env.DEPLOYMENT_HOST || 'frigear.nu'}`,
  },
  eslint: {
    config: {
      stylistic: {
        commaDangle: 'always-multiline',
        braceStyle: '1tbs',
      },
    },
  },
  events: {
    settings: {
      mcp: true,
      pages: { events: true, event: true, tickets: true, admin: true, adminEvent: true },
    },
  },
  forms: {
    settings: {
      mcp: true,
      pages: { form: true, admin: true, adminForm: true, adminSubmissions: true, adminSubmission: true },
    },
    // Opt-in: set `enabled` (NUXT_FORMS_SEED_ENABLED=true) to insert the definitions below as drafts.
    // Existing slugs are never overwritten. Definitions can also be imported from the admin page.
    seed: {
      enabled: false,
      forms: [projectApplicationForm, boardMemberApplicationForm, contactForm],
    },
  },
  i18n: {
    defaultLocale: 'da',
    locales: [
      { code: 'da', language: 'da-DK', name: 'Dansk', file: 'da.json' },
      { code: 'en', language: 'en-GB', name: 'English', file: 'en.json' },
    ],
  },
  notify: {
    email: {
      driver: 'log',
    },
    ui: {
      driver: '@nuxt/ui',
    },
  },
  // Signing keys come from NUXT_OAUTH_SERVER_PRIVATE_KEY (see .env.example); admins from NUXT_OAUTH_ADMIN_EMAILS.
  oauthServer: {
    // The Capacitor webview on iOS (`capacitor://localhost`) and Android (`https://localhost`) calls the token endpoints.
    cors: { origins: ['capacitor://localhost', 'https://localhost'] },
    settings: {
      mcp: true,
      pages: { admin: true, applications: true },
    },
  },
  payments: {
    settings: { mcp: true },
  },
  // Secrets come from NUXT_STRIPE_SECRET_KEY, NUXT_STRIPE_WEBHOOK_SECRET and NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
  stripe: {},
  subscriptions: {
    plans: {
      monthly: {
        label: 'Frigear 🍵 månedlig',
        description: '🎵 Frigear månedligt medlemskab 🎵 for frivillige og sammenlignelige hyggedyr!',
        rank: 1,
        // Stripe price lookup keys (set on the prices in the Stripe dashboard). Override with env,
        // or use `price_...` ids instead.
        prices: [
          { lookupKey: process.env.SUBSCRIPTIONS_MONTHLY_LOOKUP_KEY || 'membership_month' },
        ],
      },
      quarterly: {
        label: 'Frigear ☠️ kvartal',
        description: '☮ Frigear kvartals medlemskab ☮ for frivillige og andre awesome peeps!',
        rank: 2,
        prices: [
          { lookupKey: process.env.SUBSCRIPTIONS_QUARTERLY_LOOKUP_KEY || 'membership_quarter' },
        ],
      },
      yearly: {
        label: 'Frigear 🐼 årlig',
        description: '★ Frigear årligt medlemskab ★ for frivillige og andet frit folk!',
        rank: 3,
        prices: [
          { lookupKey: process.env.SUBSCRIPTIONS_YEARLY_LOOKUP_KEY || 'membership_annual' },
        ],
      },
    },
    settings: {
      mcp: true,
      pages: { membership: true, success: true, cancel: true },
    },
  },
  users: {
    settings: {
      // Staff user administration; the policy lives in server/plugins/users-policy.ts.
      admin: true,
      mcp: true,
      // A new address must be confirmed from its inbox; the old address gets a revert link.
      verifyEmailChange: true,
      profilePath: '/account/profile',
    },
  },
})
