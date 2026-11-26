// https://nuxt.com/docs/api/configuration/nuxt-config
import { defineRoles } from '@frigear-nu/auth/access'
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
    // Volunteering. Order matters where a module checks for another in its setup: dashboard comes before the
    // modules that add dashboard items, teams before help-center (team grants).
    '@frigear-nu/maps',
    '@frigear-nu/dashboard',
    '@frigear-nu/push',
    '@frigear-nu/operations',
    '@frigear-nu/teams',
    '@frigear-nu/crew',
    '@frigear-nu/shifts',
    '@frigear-nu/help-center',
    '@frigear-nu/inbox',
    // Short counted links for emails and SMS (`/l/:code`), with the staff list at `/admin/short-links`.
    '@frigear-nu/short-links',
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
    // Comma separated emails that are always admins once verified (NUXT_ACL_ADMINS). Bootstraps the first admin, who
    // assigns every other role in the admin (server/plugins/authorization-roles.ts).
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
      // frigear.nu decides the single sign-on roles here: these roles carry over as they are (stored as `sso` roles;
      // roles assigned here stay), any other (or none) becomes `user`
      // (NUXT_FRIGEAR_ROLE_MAP, JSON, is merged in). Listed in the order of the ladder (`authorization.roles`).
      roleMap: {
        admin: 'admin',
        coordinator: 'coordinator',
        manager: 'manager',
        eventmanager: 'eventmanager',
        barmanager: 'barmanager',
        crew: 'crew',
      },
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
        // fetch() goes out over the public internet. Without it a subrequest to a workers.dev Worker on this account
        // (a Preview signing in against frigear-nu.frigear.workers.dev) fails with Cloudflare error 1042 (404).
        compatibility_flags: ['global_fetch_strictly_public'],
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
        // Secrets: `wrangler preview base-config secret put <NAME>` (set once, inherited by each Preview).
        // Plain vars: only `previews.vars` below. `wrangler preview` sends this block as the Preview's whole env, so
        // vars set in the dashboard or the base config are dropped on every deploy (secrets are inherited).
        previews: {
          vars: {
            // "Log in with frigear.nu" against the workers.dev host (NUXT_FRIGEAR_SSO_CLIENT_ID/_SECRET are secrets).
            NUXT_FRIGEAR_SSO_URL: 'https://frigear-nu.frigear.workers.dev',
            NUXT_NOTIFY_EMAIL_DRIVER: 'resend',
            NUXT_NOTIFY_EMAIL_FROM: 'PREVIEW frigear.nu <no-reply@frigear.nu>',
            NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_51StpTcGeoReTs5WFTo0VnGyr3iafzIFbeMWuMvXVkhxmPv1gi6BCfRvaI9UXYlujukeCz6EYSvfu5Sn1OnNv9Muw002tBS0zzO',
          },
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
      // Ported from the old `account/documents.vue`. `permission` only decides what is listed: the files are static
      // assets under public/, so anyone with the URL can fetch them (as before). `documents:crew` is held by crew and
      // every role above it (`authorization.roles`).
      documents: [
        { id: 'handbook', label: { da: 'Frivillig Håndbog', en: 'Volunteer Handbook' }, path: '/assets/files/Frivillig håndbog.docx' },
        { id: 'ba-folder', label: { da: 'BA-mappe', en: 'BA folder' }, path: '/assets/files/BA-mappe.pdf', permission: 'documents:crew' },
        { id: 'shift-overview', label: 'Vagtoversigt', path: '/assets/files/Vagtoversigt.pdf', permission: 'documents:crew' },
        { id: 'ba-coordinator-meeting', label: { da: 'BA Koordinatormøde 25.03.2026', en: 'BA coordinator meeting 25.03.2026' }, path: '/assets/files/BA-Koordinatormøde-2503-2026.docx', permission: 'documents:crew' },
      ],
    },
  },
  admin: {
    settings: {
      // `admin:access` (the default): manager and above (manager, coordinator, admin), the old `canViewAdminArea` roles
      // (`authorization.roles`).
      permission: 'admin:access',
    },
  },
  authentication: {
    // The app's own permissions; roles grant them in `authorization.roles`.
    permissions: [
      { name: 'documents:crew', label: 'Read crew documents', labelKey: 'permissions.documentsCrew', description: 'See the crew documents on the account page.', group: 'documents' },
    ],
    settings: {
      // Emailed links (password reset, sign-in, verification) point at the known public URL (NUXT_PUBLIC_SITE_URL
      // overrides). PR previews have no fixed URL: there, and whenever none is known, they use the request's origin,
      // which Cloudflare fixes by routing (a request for another host never reaches this Worker).
      siteUrl: process.env.PR_NUMBER ? undefined : knownSiteUrl,
      trustRequestOrigin: true,
      afterLogin: '/dashboard',
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
      // Facebook (like any other nuxt-auth-utils provider) is offered once its credentials are set at runtime:
      // NUXT_OAUTH_FACEBOOK_CLIENT_ID / NUXT_OAUTH_FACEBOOK_CLIENT_SECRET.
      // frigear: "Log in with frigear.nu", only active on previews or when `runtimeConfig.frigear.sso` is set.
      oauth: { frigear: true },
    },
  },
  authorization: {
    // Guests on a guarded page (e.g. /account/**) are sent to the login page instead of a 401 error.
    redirectTo: '/sign-in',
    defaultRoles: ['user'],
    // The ladder, each role inheriting the one below: admin > coordinator > manager > eventmanager > barmanager > crew >
    // member > user. Supplier and partner are outside groups that only hold what `user` holds. Self-service (tickets,
    // profile, payments, forms:submit, ...) is `implicit` in the modules, so `user` grants nothing. Old grant -> new
    // permissions (the old chain had manager above coordinator; coordinator now sits above manager and adds the
    // volunteering staff permissions):
    // - eventmanager `events:manage`, `events:pii` -> + `events:refund` (refunds were part of `events:manage`);
    // - manager: the old coordinator's base staff set, `users:read` -> `users:read` + `users:list` (listing is its own
    //   permission now), `forms:manage` -> + `forms:credentials` (form tokens and secrets were part of it), `forms:pii`
    //   and `payments:manage` as they were, the admin area (`admin.settings.roles`) -> `admin:access`; and the old
    //   manager's `users:manage` (every user write) -> `users:create`, `users:update`, `users:delete`, `users:manage`,
    //   `subscriptions:manage` (free memberships and payment links were user writes) and `roles:read` + `roles:assign`
    //   (setting a user's role was a user write; a role is assigned only by someone strictly above it, so a manager
    //   assigns event manager and below, a coordinator manager and below);
    // - coordinator: the volunteering staff permissions only, which the modules grant to `admin` (`grantTo`):
    //   operations, teams, crew, shifts and help-center management with their `:pii` (`crew:pii` included), crew
    //   invites, shift broadcasts, and inbox assign/hide; inbox manage/channels/`:pii`/audit and push manage/send stay
    //   with `admin`;
    // - admin `*` plus every sensitive permission by name (`*` never covers them), so admin holds every registered
    //   permission and may assign admin. Add new sensitive permissions here when a module registers one.
    // Team leads (`ba` and up on the bar ladder) get lead rights through the teams policies, not through a role here.
    // NUXT_ACL_ADMINS adds `admin` (server/plugins/authorization-roles.ts). `defineRoles` types the grants and parents
    // against the registered permissions and roles (`.nuxt/types/auth-access.d.ts`). The `role` claim of single sign-on
    // (server/plugins/oauth-policy.ts) lists the roles in this order too.
    roles: defineRoles({
      admin: { label: 'Administrator', labelKey: 'roles.admin', grant: ['*', 'events:pii', 'forms:pii'], inherit: ['coordinator'] },
      coordinator: {
        label: 'Coordinator',
        labelKey: 'roles.coordinator',
        // The volunteering staff permissions (the modules grant them to `admin` only).
        grant: [
          'operations:manage', 'teams:manage', 'teams:pii', 'crew:manage', 'crew:invite', 'crew:pii',
          'shifts:manage', 'shifts:broadcast', 'shifts:pii', 'help-center:manage', 'help-center:send', 'help-center:pii',
          'inbox:assign', 'inbox:hide',
        ],
        inherit: ['manager'],
      },
      manager: {
        label: 'Manager',
        labelKey: 'roles.manager',
        grant: [
          'users:create', 'users:update', 'users:delete', 'users:manage', 'subscriptions:manage', 'roles:read', 'roles:assign',
          'admin:access', 'users:read', 'users:list', 'forms:manage', 'forms:credentials', 'forms:pii', 'payments:manage',
        ],
        inherit: ['eventmanager'],
      },
      eventmanager: { label: 'Event manager', labelKey: 'roles.eventmanager', grant: ['events:manage', 'events:refund', 'events:pii'], inherit: ['barmanager'] },
      barmanager: { label: 'Bar manager', labelKey: 'roles.barmanager', inherit: ['crew'] },
      crew: { label: 'Crew', labelKey: 'roles.crew', grant: ['documents:crew'], inherit: ['member'] },
      member: { label: 'Member', labelKey: 'roles.member', inherit: ['user'] },
      supplier: { label: 'Supplier', labelKey: 'roles.supplier', inherit: ['user'] },
      partner: { label: 'Partner', labelKey: 'roles.partner', inherit: ['user'] },
      user: { label: 'User', labelKey: 'roles.user' },
    }),
  },
  cookieConsent: {
    policyUrl: '/legal/gdpr',
  },
  crew: {
    // The "Crew" team crew creates for an operation without teams (our teams are bar teams).
    defaultTeamKind: 'bar',
    // Global roles to team roles on an operation's teams when staff apply the presets. A member plan maps with
    // `{ match: { plan: '<plan key>' }, teamRole: 'volunteer' }`.
    rolePresets: [
      { match: { role: 'barmanager' }, teamRole: 'ba' },
      { match: { role: 'crew' }, teamRole: 'bartender' },
    ],
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
  helpCenter: {
    // Public area `/help`, signed-in area `/account/help` (the defaults), staff pages under `/admin/help-center`.
    settings: {
      pages: { admin: true },
      // Staff write in Danish first: an article can be published with Danish only. English readers see the Danish text
      // until an English one is added (the help center falls back to the default locale).
      requiredLocales: ['da'],
      // The FAQ cards' contact button opens the site's own contact modal (components/global, so the cards resolve it by
      // name), prefilled from `initial`.
      faq: { contactComponent: 'ContactFormModal' },
    },
  },
  i18n: {
    defaultLocale: 'da',
    locales: [
      { code: 'da', language: 'da-DK', name: 'Dansk', file: 'da.json' },
      { code: 'en', language: 'en-GB', name: 'English', file: 'en.json' },
    ],
  },
  // Secrets come from NUXT_INBOX_EMAIL_WEBHOOK_SECRET, NUXT_INBOX_META_APP_SECRET, NUXT_INBOX_META_VERIFY_TOKEN and
  // NUXT_INBOX_SECRETS_<REF> (see .env.example); without them those webhooks answer 501.
  inbox: {
    // Mailboxes created on the first request when their key does not exist, never changed afterwards: set them with
    // NUXT_INBOX_MAILBOXES (JSON, see .env.example), or create them at /admin/inbox/settings.
    mailboxes: [],
    // Channel account secrets (`secretRef`) come from NUXT_INBOX_SECRETS (JSON) or NUXT_INBOX_SECRETS_<REF> for a ref
    // declared here empty.
    secrets: {},
    settings: {
      pages: { admin: true, adminThread: true, adminSettings: true },
    },
  },
  maps: {
    // Where the location picker and maps open without a value: Roskilde, at city level (the package has no default
    // location: unset, they open on a world view).
    defaultCenter: { center: [55.6415, 12.0803], zoom: 13 },
  },
  notify: {
    email: {
      driver: 'log',
    },
    ui: {
      driver: '@nuxt/ui',
    },
  },
  // Signing keys come from NUXT_OAUTH_SERVER_PRIVATE_KEY (see .env.example); `oauth:manage` is held by admins.
  oauthServer: {
    cors: {
      // The Capacitor webview on iOS (`capacitor://localhost`) and Android (`https://localhost`) calls the token
      // endpoints, and with `Authorization: Bearer` the site's API under `paths`.
      origins: ['capacitor://localhost', 'https://localhost'],
      paths: ['/api/'],
    },
    // apps/mobile (appId `nu.frigear.app`) signs in with PKCE as this public client. Its dev server's redirect URI,
    // and so its origin `http://localhost:3001` for CORS, is accepted under `nuxt dev` only.
    clients: [{
      id: 'mobile',
      name: 'Frigear app',
      redirectUris: ['nu.frigear.app:/auth/callback'],
      devRedirectUris: ['http://localhost:3001/auth/callback'],
      // Stays signed in while the app is opened at least every six months.
      refreshToken: { idleTtl: 60 * 60 * 24 * 180 },
    }],
    settings: {
      mcp: true,
      pages: { admin: true, applications: true },
    },
  },
  operations: {
    // Public page `/operations/:slug` (the default), staff pages under `/admin/operations`.
    settings: { pages: { admin: true, adminOperation: true } },
  },
  payments: {
    settings: { mcp: true },
  },
  // Without credentials pushes only go to the server log. FCM and APNs credentials come from NUXT_PUSH_* (see
  // .env.example). Users choose their notification channels at /account/notifications (@frigear-nu/preferences).
  push: {},
  shifts: {
    // Shift times follow the app's time zone (`frigearUi.timeZone` in app.config.ts).
    // Station codes are signed with a key derived from NUXT_APP_SECRET, or NUXT_SHIFTS_STATION_KEY (see .env.example).
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
  teams: {
    ladders: {
      // Our bar ladder, lowest first: `ba` (bar manager) and up lead a bar team.
      bar: {
        roles: [
          { key: 'volunteer', label: { en: 'Volunteer', da: 'Frivillig' } },
          { key: 'bartender', label: { en: 'Bartender', da: 'Bartender' } },
          { key: 'ba', label: { en: 'BA (bar manager)', da: 'BA (baransvarlig)' } },
          { key: 'coordinator', label: { en: 'Coordinator', da: 'Koordinator' } },
        ],
        leadFrom: 'ba',
      },
    },
    settings: { pages: { admin: true, adminTeam: true } },
  },
  users: {
    settings: {
      // Staff user administration; the app's extra rule (NUXT_ACL_ADMINS addresses) lives in server/policies.ts.
      admin: true,
      mcp: true,
      // A new address must be confirmed from its inbox; the old address gets a revert link.
      verifyEmailChange: true,
      profilePath: '/account/profile',
    },
  },
})
