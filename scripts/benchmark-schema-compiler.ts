import { build } from "esbuild"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"

const node = Bun.which("node")
if (node === null) throw new Error("Node.js is required")
// Keep Effect external and resolved from this workspace in fresh Node processes.
const directory = await mkdtemp(join(process.cwd(), ".schema-compiler-benchmark-"))
try {
  const entry = join(directory, "benchmark.mjs")
  await build({ entryPoints: ["scripts/fixtures/schema-compiler-benchmark.ts"], outfile: entry,
    bundle: true, platform: "node", format: "esm", packages: "external" })
  for (const mode of ["interpreted", "jit", "jit", "interpreted"]) {
    const proc = Bun.spawn([node, entry, mode], { stdout: "inherit", stderr: "inherit" })
    if (await proc.exited !== 0) throw new Error(`Benchmark failed: ${mode}`)
  }
} finally {
  await rm(directory, { recursive: true, force: true })
}
