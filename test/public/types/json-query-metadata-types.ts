import * as Schema from "effect/Schema"
import { Column, Json, Query, Scalar, Table } from "effect-qb"
import { Executor as PgExecutor } from "effect-qb/postgres"
import { Executor as MyExecutor } from "effect-qb/mysql"
import { Executor as SqExecutor } from "effect-qb/sqlite"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Assert<T extends true> = T

const docs = Table.make("metadata_docs", {
  id: Column.text(),
  payload: Column.json(Schema.Struct({ tags: Schema.Array(Schema.String) }))
})
const tags = docs.payload.tags
const size = Json.length(tags)
const object = Json.buildObject({ id: docs.id, source: "fixture" })
const array = Json.buildArray(docs.id, "fixture")
type SizeDialect = Assert<Equal<typeof size[Scalar.TypeId]["dialect"], "standard">>
type ObjectDialect = Assert<Equal<typeof object[Scalar.TypeId]["dialect"], "standard">>
type ArrayDialect = Assert<Equal<typeof array[Scalar.TypeId]["dialect"], "standard">>

const plan = Query.select({ size, object, array }).pipe(Query.from(docs))
const complete: Query.CompletePlan<typeof plan> = plan
PgExecutor.make().execute(complete)
MyExecutor.make().execute(complete)
SqExecutor.make().execute(complete)

// @ts-expect-error JSON construction must not discard its referenced table
SqExecutor.make().execute(Query.select({ object }))
// @ts-expect-error JSON arrays must not discard their referenced table
SqExecutor.make().execute(Query.select({ array }))
// @ts-expect-error JSON length must not discard its referenced table
SqExecutor.make().execute(Query.select({ size }))
