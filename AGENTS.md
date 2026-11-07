## Hono CLI

Run `npx hono --help` first, and use the CLI instead of a dev server.

## Railway environment variables

Never overwrite Railway's `TRIGGER_SECRET_KEY` with the value from the local `.env`. The local value is the Trigger.dev **dev** key (`tr_dev_...`); Railway must keep the **prod** key (`tr_prod_...`).

When using the Railway skill to sync/push environment variables from `.env`, always exclude `TRIGGER_SECRET_KEY`. Only change it on Railway if the user explicitly provides a new production key in that request.
