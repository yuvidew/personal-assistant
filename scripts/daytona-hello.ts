import { Daytona } from "@daytona/sdk";

// Smoke test: create a Daytona sandbox, run "Hello World" inside it, capture the
// output, and always delete the sandbox afterwards.
//
// Run:  bun --env-file=.env scripts/daytona-hello.ts

if (!process.env.DAYTONA_API_KEY) {
  console.error(
    "DAYTONA_API_KEY is not set. Create a key at https://app.daytona.io/dashboard/keys " +
      "and add it to .env as DAYTONA_API_KEY=..."
  );
  process.exit(1);
}

// Reads DAYTONA_API_KEY (and optional DAYTONA_API_URL / DAYTONA_TARGET) from the environment.
const daytona = new Daytona();
let sandbox: Awaited<ReturnType<typeof daytona.create>> | undefined;

try {
  sandbox = await daytona.create({ language: "typescript" });
  console.log(`Sandbox created: ${sandbox.id}`);

  const response = await sandbox.process.codeRun('console.log("Hello World from Daytona!")');
  if (response.exitCode !== 0) {
    throw new Error(`Program exited with code ${response.exitCode}: ${response.result}`);
  }
  console.log(`Sandbox output: ${response.result.trim()}`);
} finally {
  if (sandbox) {
    await daytona.delete(sandbox);
    console.log("Sandbox deleted.");
  }
}
