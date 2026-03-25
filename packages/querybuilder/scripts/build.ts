import { mkdir, rm, stat } from "node:fs/promises"
import { join } from "node:path"

const cwd = process.cwd()
const distDir = join(cwd, "dist")

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
    "src/postgres.ts",
    "src/postgres/metadata.ts",
    "src/mysql.ts"
  ], {
    cwd,
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
