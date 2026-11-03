---
seo:
  title: Frigear Developer Docs
  description: Build on the Frigear Nuxt ecosystem - modules for sign-in, users, payments, events and forms, plus the layer and tooling they run on.
---

::u-page-hero
#title
Build on the Frigear Nuxt ecosystem

#description
Composable Nuxt 4 modules for sign-in, users, payments, events and forms, a shared base layer, and the tooling to add your own.

#headline
  :::u-button
  ---
  color: neutral
  size: sm
  to: /get-started/installation
  variant: subtle
  trailing-icon: i-lucide-arrow-right
  ---
  Quick start: pnpx giget@latest gh:Frigear-nu/frigear-nu/.starters/workspace my-app
  :::

#links
  :::u-button
  ---
  size: xl
  to: /get-started/introduction
  trailing-icon: i-lucide-arrow-right
  ---
  Build an app
  :::

  :::u-button
  ---
  color: neutral
  size: xl
  to: /contribute/overview
  variant: outline
  icon: i-lucide-git-pull-request
  ---
  Contribute
  :::
::

::u-page-section
#title
Pick a starter

#description
Each starter is a pnpm workspace you copy and run. They use the published `@frigear-nu` packages.

#features
  :::u-page-feature
  ---
  icon: i-lucide-rocket
  to: /examples/starters/workspace
  ---
  #title
  Workspace

  #description
  One Nuxt 4 app with registration, sign-in, account pages and a user admin.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-smartphone
  to: /examples/starters/mobile
  ---
  #title
  Mobile

  #description
  A Capacitor app that signs in at frigear.nu or any OpenID Connect issuer.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-tablet-smartphone
  to: /examples/starters/mobile-standalone
  ---
  #title
  Mobile standalone

  #description
  The workspace starter plus a mobile app, with your own OAuth server and API.
  :::
::

::u-page-section
#headline
Modules by area

#title
Identity

#description
Who the users are, how they sign in and what they may do. [See all modules](/modules).

#default
  ::::u-page-grid
  :::u-page-card
  ---
  icon: i-lucide-log-in
  title: Auth
  description: Sign-in, API tokens and requireAuth.
  to: /modules/identity/auth
  ---
  :::
  :::u-page-card
  ---
  icon: i-lucide-users
  title: Users
  description: The user entity and administration.
  to: /modules/identity/users
  ---
  :::
  :::u-page-card
  ---
  icon: i-lucide-user-cog
  title: Account
  description: Profile and security pages.
  to: /modules/identity/account
  ---
  :::
  :::u-page-card
  ---
  icon: i-lucide-shield-check
  title: Authorization
  description: Abilities, policies and roles.
  to: /modules/identity/authorization
  ---
  :::
  :::u-page-card
  ---
  icon: i-lucide-sliders-horizontal
  title: Preferences
  description: Typed per-user preferences.
  to: /modules/identity/preferences
  ---
  :::
  :::u-page-card
  ---
  icon: i-lucide-server
  title: OAuth Server
  description: An OAuth 2.0 / OpenID Connect server.
  to: /modules/identity/oauth-server
  ---
  :::
  :::u-page-card
  ---
  icon: i-lucide-key-round
  title: Auth client mode
  description: PKCE sign-in for SPAs and Capacitor apps.
  to: /modules/identity/auth/client-mode
  ---
  :::
  :::u-page-card
  ---
  icon: i-lucide-plug
  title: Frigear Resource
  description: Accept frigear.nu access tokens.
  to: /modules/identity/frigear-resource
  ---
  :::
  ::::
::

::u-page-section
#title
Commerce

#description
Taking money through Stripe.

#default
  ::::u-page-grid
  :::u-page-card
  ---
  icon: i-lucide-credit-card
  title: Stripe
  description: Customers and one verified webhook.
  to: /modules/commerce/stripe
  ---
  :::
  :::u-page-card
  ---
  icon: i-lucide-banknote
  title: Payments
  description: One-time payments.
  to: /modules/commerce/payments
  ---
  :::
  :::u-page-card
  ---
  icon: i-lucide-repeat
  title: Subscriptions
  description: Plans and entitlements.
  to: /modules/commerce/subscriptions
  ---
  :::
  ::::
::

::u-page-section
#title
Features

#description
Ready-made product features.

#default
  ::::u-page-grid
  :::u-page-card
  ---
  icon: i-lucide-ticket
  title: Events
  description: Tickets, capacity and QR check-in.
  to: /modules/features/events
  ---
  :::
  :::u-page-card
  ---
  icon: i-lucide-clipboard-list
  title: Forms
  description: Database-backed forms with delivery.
  to: /modules/features/forms
  ---
  :::
  :::u-page-card
  ---
  icon: i-lucide-cookie
  title: Cookie Consent
  description: GDPR banner and proof of consent.
  to: /modules/features/cookie-consent
  ---
  :::
  :::u-page-card
  ---
  icon: i-lucide-bot
  title: MCP
  description: Scope-gated MCP tools.
  to: /modules/features/mcp
  ---
  :::
  ::::
::

::u-page-section
#title
Interface

#description
The shell, navigation and components screens are built from.

#default
  ::::u-page-grid
  :::u-page-card
  ---
  icon: i-lucide-palette
  title: UI
  description: Shared components and composables.
  to: /modules/interface/ui
  ---
  :::
  :::u-page-card
  ---
  icon: i-lucide-layout-dashboard
  title: Admin
  description: The guarded admin shell.
  to: /modules/interface/admin
  ---
  :::
  :::u-page-card
  ---
  icon: i-lucide-menu
  title: Menu
  description: Named navigation menus.
  to: /modules/interface/menu
  ---
  :::
  :::u-page-card
  ---
  icon: i-lucide-layout-grid
  title: Widget
  description: Widget and tab areas.
  to: /modules/interface/widget
  ---
  :::
  :::u-page-card
  ---
  icon: i-lucide-smartphone
  title: Mobile
  description: The Capacitor app shell.
  to: /modules/interface/mobile
  ---
  :::
  ::::
::

::u-page-section
#title
Platform

#description
Building blocks other modules and apps stand on.

#default
  ::::u-page-grid
  :::u-page-card
  ---
  icon: i-lucide-wrench
  title: Module Kit
  description: Helpers for writing modules.
  to: /modules/platform/module-kit
  ---
  :::
  :::u-page-card
  ---
  icon: i-lucide-bell
  title: Notify
  description: Email and SMS drivers.
  to: /modules/platform/notify
  ---
  :::
  :::u-page-card
  ---
  icon: i-lucide-mail
  title: Email Templates
  description: Vue email templates.
  to: /modules/platform/email-templates
  ---
  :::
  :::u-page-card
  ---
  icon: i-lucide-layers
  title: Base Layer
  description: The shared Nuxt layer.
  to: /modules/platform/base-layer
  ---
  :::
  ::::
::

::u-page-section
#title
Common tasks

#description
Short walkthroughs you can copy into your app.

#features
  :::u-page-feature
  ---
  icon: i-lucide-shield-check
  to: /examples/tasks/protect-a-route
  ---
  #title
  Protect a route

  #description
  Require a signed-in user, limit by scope, restrict to cookie sessions.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-layout-dashboard
  to: /examples/tasks/add-an-admin-page
  ---
  #title
  Add an admin page

  #description
  A list page with a sidebar entry in the admin area.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-ticket
  to: /examples/tasks/sell-event-tickets
  ---
  #title
  Sell event tickets

  #description
  Paid and free tickets with Events, Payments and Stripe.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-clipboard-list
  to: /examples/tasks/build-a-form
  ---
  #title
  Build a form

  #description
  Define a form in code and publish it with email delivery.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-mail
  to: /examples/tasks/send-an-email
  ---
  #title
  Send an email

  #description
  A branded email from a Vue template, with a delivery driver.
  :::
::

::u-page-section
#title
Read first

#features
  :::u-page-feature
  ---
  icon: i-lucide-network
  to: /guide/concepts/architecture
  ---
  #title
  Architecture

  #description
  How modules, the base layer and your app fit together.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-user-round
  to: /guide/concepts/identity
  ---
  #title
  Identity

  #description
  How sign-in, users and the OAuth modules relate.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-key-round
  to: /guide/concepts/auth-and-scopes
  ---
  #title
  Auth and scopes

  #description
  Credentials, scopes and when a route needs a session.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-panel-left
  to: /guide/ux-patterns/layouts-and-navigation
  ---
  #title
  Layouts and navigation

  #description
  Which layout an area uses and where new pages go.
  :::
::

::u-page-section
#title
Two ways in

#features
  :::u-page-feature
  ---
  icon: i-lucide-rocket
  to: /get-started/introduction
  ---
  #title
  Build an app

  #description
  Start from a starter, sign users in, add modules and deploy. You use the published `@frigear-nu` packages.
  :::

  :::u-page-feature
  ---
  icon: i-lucide-git-pull-request
  to: /contribute/overview
  ---
  #title
  Contribute

  #description
  Work in this monorepo: run it locally, write a module, keep the starters in step and release packages.
  :::
::
