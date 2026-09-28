import { defineNuxtModule, addServerHandler, createResolver } from "@nuxt/kit";
import { registerModule, extendModulePages } from "@frigear-nu/module-kit/utils";
import { addModuleServerRoute } from "@frigear-nu/module-kit/utils";

const moduleName = "module-kit-playground";
export default defineNuxtModule({
  meta: {
    name: moduleName,
    configKey: "moduleKitPlayground",
  },
  moduleDependencies: {
    "@frigear-nu/module-kit": {
      version: "workspace:*",
    },
  },
  defaults: {},
  setup(_options, _nuxt) {
    const resolver = createResolver(import.meta.url);
    // Module setup logic here
    registerModule(moduleName, _nuxt);

    extendModulePages(moduleName, (pages) => {
      pages.push({
        route: "/hello",
        file: resolver.resolve("./app/pages/hello.vue"),
      })

      pages.push({
        route: 'hello', // should become ${moduleName}/hello
        file: resolver.resolve("./app/pages/hello.vue"),
      })
    });


    addModuleServerRoute(moduleName, "/api/hello", {
      method: "GET",
      handler: resolver.resolve("./server/api/hello.ts"),
    });

    // Should be mounted on /api/${moduleName}/hello
    addModuleServerRoute(moduleName, "hello", {
      method: "GET",
      handler: resolver.resolve("./server/api/hello.ts"),
    });
  },
});
