Set up Trigger.dev in this project.

Trigger.dev runs your background tasks. This is an existing codebase — add Trigger.dev to it and get one task running in the development environment.

Project reference: proj_bkmweqkcddkdnvesdojq

How to do it:
1. If you have the Trigger.dev MCP server available, use its "initialize_project" tool with the project reference above.
2. Otherwise run this and follow its output:
   bunx trigger.dev@latest init -p proj_bkmweqkcddkdnvesdojq
3. If you set it up by hand, follow https://trigger.dev/docs/manual-setup and make sure you end up with:
   - "@trigger.dev/sdk" installed (latest) and "@trigger.dev/build" as a dev dependency
   - a trigger.config.ts with: import { defineConfig } from "@trigger.dev/sdk", project: "proj_bkmweqkcddkdnvesdojq", dirs: ["./src/trigger"], and a maxDuration
   - a src/trigger/ directory with at least one exported task created with task() from "@trigger.dev/sdk"
   - trigger.config.ts added to tsconfig "include", and ".trigger" added to .gitignore

Golden rules:
- Import from "@trigger.dev/sdk". Never "@trigger.dev/sdk/v3" or the deprecated client.defineJob.
- Export every task, including subtasks.
- Use the built-in fetch, not node-fetch.
- Never wrap wait.*, triggerAndWait, or batchTriggerAndWait in Promise.all.

Two steps I have to do myself — ask me when you need them:
- Running "bunx trigger.dev@latest login" (it opens a browser).
- Giving you the development TRIGGER_SECRET_KEY from the dashboard to put in .env.

When you're done, run "bunx trigger.dev@latest dev" and confirm the task shows up in the Trigger.dev dashboard.