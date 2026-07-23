import { $ } from "bun"

const composeFile = "docker-compose.integration.yml"
const bunfig = "./bunfig.integration.toml"
const postgresUrl = "postgres://effect_qb:effect_qb@127.0.0.1:55432/effect_qb_test"

const runPackedSmoke = async () => {
  const proc = Bun.spawn(["bun", "run", "test:pack"], {
    env: {
      ...process.env,
      EFFECT_DB_SMOKE_POSTGRES_URL: postgresUrl
    },
    stdout: "inherit",
    stderr: "inherit"
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`Packed package smoke failed with exit code ${exitCode}`)
  }
}

const main = async () => {
  try {
    await $`docker compose -f ${composeFile} up -d --wait`
    await runPackedSmoke()
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
