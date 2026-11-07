import { defineConfig } from "@trigger.dev/sdk";
import { aptGet } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_bkmweqkcddkdnvesdojq",
  dirs: ["./src/trigger"],
  maxDuration: 300,
  build: {
    extensions: [
      // @daytona/sdk depends on node-liblzma, a native addon that compiles against liblzma
      // and needs pkg-config at install time in the deploy image.
      aptGet({ packages: ["pkg-config", "liblzma-dev"] }),
    ],
  },
});
