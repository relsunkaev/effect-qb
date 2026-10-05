import * as Effect from "effect/Effect"
import * as SqlClient from "effect/sql/SqlClient"

/** PostgreSQL owns statement boundaries, including quoted and procedural bodies. */
export const postgresStatements = async (script: string): Promise<readonly string[]> => {
  if (script.includes("\0")) throw new Error("PostgreSQL scripts cannot contain NUL")
  const { parse } = await import("libpg-query")
  const parsed = await parse(script)
  const bytes = new TextEncoder().encode(script)
  const decoder = new TextDecoder()
  return (parsed.stmts ?? []).map((statement) => {
    // libpg_query locations and lengths are UTF-8 byte offsets, not JS indexes.
    const start = statement.stmt_location ?? 0
    const end = statement.stmt_len ? start + statement.stmt_len : bytes.length
    return decoder.decode(bytes.subarray(start, end))
  })
}

/** Executes inside the caller's existing transaction; never splits SQL itself. */
export const executePostgresScript = (script: string): Effect.Effect<void, unknown, SqlClient.SqlClient> =>
  Effect.gen(function*() {
    const statements = yield* Effect.tryPromise(() => postgresStatements(script))
    const sql = yield* SqlClient.SqlClient
    yield* Effect.forEach(statements, (statement) => sql.unsafe(statement), { discard: true })
  })
