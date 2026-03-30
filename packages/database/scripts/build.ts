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
    "src/index.ts",
    "src/postgres/pull.ts",
    "src/postgres/push.ts",
    "src/postgres/migrate.ts",
    "src/cli.ts"
  ], {
    cwd,
    stdout: "inherit",
    stderr: "inherit"
  })

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    process.exit(exitCode)
  }

  await Bun.write(join(distDir, "index.d.ts"), 'export * from "./index.js"\n')
  await Bun.write(join(distDir, "postgres", "pull.d.ts"), 'export * from "./pull.js"\n')
  await Bun.write(join(distDir, "postgres", "push.d.ts"), 'export * from "./push.js"\n')
  await Bun.write(join(distDir, "postgres", "migrate.d.ts"), 'export * from "./migrate.js"\n')

  const distStat = await stat(distDir)
  if (!distStat.isDirectory()) {
    throw new Error("build did not produce a dist directory")
  }
}

await main()
