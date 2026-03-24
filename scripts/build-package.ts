import { mkdir, rm, stat } from "node:fs/promises"
import { join } from "node:path"

const distDir = join(process.cwd(), "dist")

const main = async () => {
  await rm(distDir, { recursive: true, force: true })
  await mkdir(distDir, { recursive: true })

  const proc = Bun.spawn([
    process.execPath,
    "build",
    "--outdir",
    "dist",
    "--target",
    "node",
    "--format",
    "esm",
    "--packages",
    "external",
    "--root",
    "src",
    "src/cli.ts",
    "src/postgres.ts",
    "src/mysql.ts"
  ], {
    cwd: process.cwd(),
    stdout: "inherit",
    stderr: "inherit"
  })

  const exitCode = await proc.exited

  if (exitCode !== 0) {
    process.exit(exitCode)
  }

  const distStat = await stat(distDir)

  if (!distStat.isDirectory()) {
    throw new Error("build did not produce a dist directory")
  }
}

await main()
