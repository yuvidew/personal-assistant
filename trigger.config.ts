import { defineConfig } from "@trigger.dev/sdk";
import { aptGet } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_bkmweqkcddkdnvesdojq",
  dirs: ["./src/trigger"],
  maxDuration: 300,
  build: {
    // @daytona/sdk loads `form-data` dynamically for sandbox file uploads, so the bundler
    // can't see it. Keep it external so it is installed in the deploy image.
    external: ["form-data"],
    extensions: [
      // @daytona/sdk depends on node-liblzma, a native addon that compiles against liblzma
      // and needs pkg-config at install time in the deploy image.
      aptGet({ packages: ["pkg-config", "liblzma-dev"] }),
    ],
  },
});
