Help me set up Daytona in this project. Before writing any Daytona code, verify the setup:

1. Check that the Daytona SDK is installed for the language used in this project. If not, install it.

  Python: `pip install daytona`
  TypeScript: `bun add @daytona/sdk`
  Ruby: `gem install daytona`
  Go: `go get github.com/daytona/clients/sdk-go`
  Java: add the `io.daytona:sdk` dependency to `build.gradle.kts` or `pom.xml`

2. Check DAYTONA_API_KEY in the shell environment or in environment files. If not set, tell the user they need an API key and point them to https://app.daytona.io/dashboard/keys to create one.

3. Write a script that initializes the Daytona client, creates a sandbox, runs a "Hello World" program inside it, captures the output, and deletes the sandbox.

4. Run the script to verify the sandbox works.