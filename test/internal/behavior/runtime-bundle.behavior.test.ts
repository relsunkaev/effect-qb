import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

test("published SQLite runtime entrypoints bundle without the PostgreSQL parser", async () => {
  const dir = await mkdtemp(join(tmpdir(), "effect-qb-runtime-bundle-"))
  try {
    const entry = join(dir, "entry.ts")
    await Bun.write(entry, [
      `export { Renderer, Executor } from ${JSON.stringify(resolve("packages/querybuilder/dist/sqlite.js"))}`,
      `export { Column, Table, Query } from ${JSON.stringify(resolve("packages/querybuilder/dist/index.js"))}`
    ].join("\n"))
    const result = await Bun.build({
      entrypoints: [entry],
      target: "browser",
      external: ["effect/*"],
      plugins: [{
        name: "runtime-dependency-boundary",
        setup(build) {
          build.onResolve({ filter: /pgsql-ast-parser/ }, () => {
            throw new Error("SQLite runtime must not load PostgreSQL schema parsing")
          })
        }
      }]
    })
    if (!result.success) throw new AggregateError(result.logs, "Runtime bundle failed")
    expect(result.outputs.length).toBe(1)
    expect(result.outputs[0]!.size).toBeGreaterThan(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
