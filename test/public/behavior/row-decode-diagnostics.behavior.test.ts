import { expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { Column, Executor, Query as Q, Table } from "#standard"
import * as Pg from "#postgres"
import * as My from "#mysql"
import * as Sq from "#sqlite"

const secret = "private-row-value"
const parameter = "private-query-parameter"
const records = Table.make("diagnostic_records", {
  id: Column.text(),
  payload: Column.json(Schema.Struct({ token: Schema.Literal("accepted") }))
})
const plan = Q.select({ payload: records.payload }).pipe(
  Q.from(records), Q.where(Q.eq(records.id, parameter))
)
const raw = JSON.stringify({ token: secret })

type QueryError = Pg.Executor.PostgresQueryError<typeof plan> | My.Executor.MysqlQueryError<typeof plan> | Sq.Executor.SqliteQueryError<typeof plan>
interface DiagnosticExecutor {
  readonly dialect: string
  execute(query: typeof plan): Effect.Effect<unknown, QueryError>
  executeResult(query: typeof plan): Effect.Effect<unknown, QueryError>
  prepare(query: typeof plan): Executor.PreparedQuery<unknown, QueryError>
  stream(query: typeof plan): Stream.Stream<unknown, QueryError>
}
const cases: readonly { readonly name: string; readonly make: (reportInput: boolean) => DiagnosticExecutor }[] = [
  { name: "postgres", make: (reportInput) => Pg.Executor.make({ reportInput, driver: Pg.Executor.driver(() => Effect.succeed([{ payload: raw }])) }) },
  { name: "mysql", make: (reportInput) => My.Executor.make({ reportInput, driver: My.Executor.driver(() => Effect.succeed([{ payload: raw }])) }) },
  { name: "sqlite", make: (reportInput) => Sq.Executor.make({ reportInput, driver: Sq.Executor.driver(() => Effect.succeed([{ payload: raw }])) }) }
]

for (const dialect of cases) {
  for (const reportInput of [false, true]) {
    test(`${dialect.name}: schema input reporting is explicit across execution paths (${reportInput})`, async () => {
      const executor = dialect.make(reportInput)
      const prepared = executor.prepare(plan)
      const runs = [
        executor.execute(plan), executor.executeResult(plan),
        prepared.execute, prepared.executeResult, Stream.runCollect(executor.stream(plan))
      ]
      for (const run of runs) {
        const error = await Effect.runPromise(Effect.flip(run))
        if (error._tag !== "RowDecodeError") throw new Error(`Unexpected failure: ${error._tag}`)
        expect(error.raw).toBe(raw)
        expect(error.normalized).toEqual({ token: secret })
        expect(error.query?.params).toContain(parameter)
        expect(error.schemaError).toBeDefined()
        expect(error.schemaError!.message.includes(secret)).toBe(reportInput)

        const safe = Executor.formatRowDecodeError(error)
        expect(safe).toBe(`RowDecodeError (${executor.dialect}/schema) at ["payload"]`)
        expect(safe).not.toContain(secret)
        expect(safe).not.toContain(parameter)
        const verbose = Executor.formatRowDecodeError(error, { reportInput: true })
        expect(verbose).toContain(secret)
        expect(verbose).toContain(parameter)
      }
    })
  }
}

test("safe formatting ignores arbitrary causes, SQL literals, and schema messages without reading raw values", async () => {
  const error = await Effect.runPromise(Effect.flip(Pg.Executor.make({
    driver: Pg.Executor.driver(() => Effect.succeed([{ payload: raw }]))
  }).execute(plan)))
  if (error._tag !== "RowDecodeError") throw new Error("Expected RowDecodeError")
  const sensitive: Executor.RowDecodeError = {
    ...error,
    message: secret,
    query: { sql: `select '${secret}'`, params: [parameter] },
    cause: new Error(secret),
    schemaError: { message: secret, issue: {} },
    get raw() { throw new Error("Safe formatting must not inspect raw values") }
  }
  expect(Executor.formatRowDecodeError(sensitive)).toBe('RowDecodeError (postgres/schema) at ["payload"]')
})

test("normalization failures also format safely; verbose output supports bigint and cycles", async () => {
  const dates = Table.make("dates", { value: Column.date() })
  const error = await Effect.runPromise(Effect.flip(Pg.Executor.make({
    driver: Pg.Executor.driver(() => Effect.succeed([{ value: secret }]))
  }).execute(Q.select({ value: dates.value }).pipe(Q.from(dates)))))
  if (error._tag !== "RowDecodeError") throw new Error("Expected RowDecodeError")
  expect(error.stage).toBe("normalize")
  expect(Executor.formatRowDecodeError(error)).not.toContain(secret)
  const circular: Record<string, unknown> = { id: 42n }
  circular.self = circular
  const verbose = Executor.formatRowDecodeError({ ...error, raw: circular }, { reportInput: true })
  expect(verbose).toContain("42n")
  expect(verbose).toContain("[Circular]")
})
