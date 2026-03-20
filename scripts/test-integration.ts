import { $ } from "bun"

const composeFile = "docker-compose.integration.yml"

const main = async () => {
  try {
    await $`docker compose -f ${composeFile} up -d --wait`
    await $`bun test test/integration/postgres.integration.ts test/integration/mysql.integration.ts`
  } finally {
    try {
      await $`docker compose -f ${composeFile} down -v`
    } catch {
      // Best effort cleanup after test failures.
    }
  }
}

await main()
