import * as Effect from "effect/Effect"
import { Column, Query, Table } from "effect-qb"
import * as Pg from "effect-qb/postgres"
import * as My from "effect-qb/mysql"
import * as Sq from "effect-qb/sqlite"

const records = Table.make("records", { id: Column.int() })
const plan = Query.select({ id: records.id }).pipe(Query.from(records))

Pg.Executor.make().execute(plan).pipe(Effect.catchTag("RowDecodeError", (error) => Effect.succeed(error.projection.path)))
My.Executor.make().execute(plan).pipe(Effect.catchTag("RowDecodeError", (error) => Effect.succeed(error.projection.path)))
Sq.Executor.make().execute(plan).pipe(Effect.catchTag("RowDecodeError", (error) => Effect.succeed(error.projection.path)))

Pg.Executor.make({ reportInput: true }).execute(plan).pipe(
  Effect.catchTag("RowDecodeError", (error) => Effect.logWarning(Pg.Executor.formatRowDecodeError(error)))
)
My.Executor.make({ reportInput: true }).execute(plan).pipe(
  Effect.catchTag("RowDecodeError", (error) => Effect.logWarning(My.Executor.formatRowDecodeError(error)))
)
Sq.Executor.make({ reportInput: true }).execute(plan).pipe(
  Effect.catchTag("RowDecodeError", (error) => Effect.logWarning(Sq.Executor.formatRowDecodeError(error)))
)
