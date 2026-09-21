# @frigear-nu/root

A Rewrite of the previous nuxt simple content site based website to a more modular and composable format.

The purpose of this repo is to provide a base for building a modular nuxt application with shared modules and components that can be used across multiple applications within the frigear ecosystem.


## Apps

- [@frigear-nu/website](./apps/website) - the main website application


## Packages

- [@frigear-nu/ui](./packages/ui) - Shared UI components
- [@frigear-nu/eslint-config](./packages/eslint-config)
- [@frigear-nu/module-kit](./packages/module-kit) - Shared module kit for building nuxt modules within frigear
- [@frigear-nu/oauth-server](./packages/oauth-server) - OAuth server for handling authentication and authorization - implementation is left up to the consumer for now
- [@frigear-nu/users](./packages/users) - Users module for handling user management and authentication in frigear
