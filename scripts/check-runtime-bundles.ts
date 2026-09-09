import { build } from "esbuild"
import { join, resolve } from "node:path"
import { gzipSync } from "node:zlib"

interface BundleFixture {
  readonly name: string
  readonly entry: string
  readonly member: string
  readonly call: string
  readonly args?: string
  readonly forbidden: readonly string[]
  readonly required?: readonly string[]
  readonly maxBytes?: number
}

const fixtures: readonly BundleFixture[] = [
  { name: "column", maxBytes: 25000, entry: "index", member: "Column", call: "text", forbidden: ["/dialect-renderers/", "/errors/", "pgsql-ast-parser"] },
  { name: "sqlite renderer", maxBytes: 130000, entry: "sqlite", member: "Renderer", call: "make", forbidden: ["/errors/", "pgsql-ast-parser"] },
  { name: "mysql renderer", maxBytes: 130000, entry: "mysql", member: "Renderer", call: "make", forbidden: ["/errors/", "pgsql-ast-parser"] },
  { name: "postgres renderer", maxBytes: 130000, entry: "postgres", member: "Renderer", call: "make", forbidden: ["/errors/", "pgsql-ast-parser"] },
  { name: "postgres executor", maxBytes: 250000, entry: "postgres", member: "Executor", call: "make", forbidden: ["pgsql-ast-parser"] },
  { name: "mysql executor", entry: "mysql", member: "Executor", call: "make", forbidden: ["pgsql-ast-parser"], required: ["/mysql/errors/catalog.js"] },
  { name: "postgres schema parsing", entry: "postgres", member: "SchemaExpression", call: "parseExpression", args: '"1 + 2"', forbidden: [], required: ["pgsql-ast-parser"] }
]

/** Inspect emitted contributions, not resolution: unused modules may be visited then removed. */
export const verifyRuntimeBundles = async (packageDir: string) => {
  const measurements: Array<{ name: string; bytes: number; gzipBytes: number }> = []
  for (const fixture of fixtures) {
    const entry = join(packageDir, "dist", `${fixture.entry}.js`)
    const result = await build({
      stdin: {
        contents: `import { ${fixture.member} } from ${JSON.stringify(entry)}; console.log(${fixture.member}.${fixture.call}(${fixture.args ?? ""}));`,
        resolveDir: packageDir
      },
      bundle: true,
      platform: "browser",
      format: "esm",
      minify: true,
      external: ["effect/*"],
      write: false,
      metafile: true
    })
    const contributing = Object.values(result.metafile.outputs).flatMap((output) =>
      Object.entries(output.inputs).filter(([, input]) => input.bytesInOutput > 0).map(([path]) => path.replaceAll("\\", "/"))
    )
    const unexpected = contributing.filter((path) => fixture.forbidden.some((part) => path.includes(part)))
    if (unexpected.length > 0) {
      throw new Error(`${fixture.name} includes unused runtime dependencies:\n${unexpected.join("\n")}`)
    }
    for (const required of fixture.required ?? []) {
      if (!contributing.some((path) => path.includes(required))) {
        throw new Error(`${fixture.name} lost required dependency: ${required}`)
      }
    }
    const output = result.outputFiles[0]
    if (output === undefined || output.contents.length === 0) throw new Error(`${fixture.name} produced no bundle`)
    // A prebundled input can hide its dependency names from the metafile.
    // Generous budgets catch that regression without pinning exact output bytes.
    if (fixture.maxBytes !== undefined && output.contents.length > fixture.maxBytes) {
      throw new Error(`${fixture.name} exceeds its runtime bundle budget: ${output.contents.length} > ${fixture.maxBytes}`)
    }
    measurements.push({ name: fixture.name, bytes: output.contents.length, gzipBytes: gzipSync(output.contents).length })
  }
  return measurements
}

if (import.meta.main) {
  console.log(await verifyRuntimeBundles(resolve("packages/querybuilder")))
}
