# @frigear-nu/root
> NOTE: In the future this code will be replacing [frigear-nu/nuxt-frigear-nu](https://github.com/Frigear-nu/nuxt-frigear-nu) as the main frigear nuxt application.

A Rewrite of the previous nuxt [simple content site](https://github.com/hareland/simple-content-site) based website of [frigear.nu](https://github.com/Frigear-nu/nuxt-frigear-nu) to a more modular and composable format.

The purpose of this repo is to provide a base for building a modular nuxt application with shared modules and components that can be used across multiple applications within the frigear ecosystem.


## Apps

- [@frigear-nu/website](./apps/website) - the main website application
- [@frigear-nu/docs](./apps/docs) - the documentation application


## Packages

- [@frigear-nu/ui](./packages/ui) - Shared UI components
- [@frigear-nu/eslint-config](./packages/eslint-config)
- [@frigear-nu/module-kit](./packages/module-kit) - Shared module kit for building nuxt modules within frigear
- [@frigear-nu/oauth-server](./packages/oauth-server) - OAuth server for handling authentication and authorization - implementation is left up to the consumer for now
- [@frigear-nu/users](./packages/users) - Users module for handling user management and authentication in frigear
- [@frigear-nu/notify](./packages/notify) - Email notification driver/dispatch Nuxt module (app chooses the driver), shared across modules
- [@frigear-nu/menu](./packages/menu) - Named, shareable navigation menus (`extendMenu`, Nuxt Content, `useMenu`) contributed to by other frigear modules
- [@frigear-nu/account](./packages/account) - Account area module (profile, security, change email/password) migrated from nuxt-frigear-nu
