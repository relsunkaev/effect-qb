import { $ } from "bun"

const composeFile = "docker-compose.integration.yml"
const bunfig = "./bunfig.integration.toml"

const main = async () => {
  try {
    await $`docker compose -f ${composeFile} up -d --wait`
    await $`bun --config=${bunfig} test --timeout 60000 ./test/public/integration/*.integration.ts`
  } finally {
    try {
      await $`docker compose -f ${composeFile} down -v`
    } catch {
      // Best effort cleanup after test failures.
    }
  }
}

await main()
