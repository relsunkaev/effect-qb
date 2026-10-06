import { Cast, Column, Function, Query, Scalar, Table, Type } from "effect-qb"
import { Executor } from "effect-qb/sqlite"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Assert<T extends true> = T

const users = Table.make("case_metadata_users", {
  id: Column.text(),
  visits: Column.int()
})
const label = Query.case().when(Query.gt(users.visits, 3), "busy").else("quiet")
const role = Query.match(users.id).when("alice", "member").else("guest")
const groupedLabel = Query.match(Function.count(users.id)).when(Cast.to(1, Type.bigint()), "solo").else("many")
type Label = Assert<Equal<Scalar.RuntimeOf<typeof label>, "busy" | "quiet">>
type Role = Assert<Equal<Scalar.RuntimeOf<typeof role>, "member" | "guest">>
type LabelDialect = Assert<Equal<typeof label[Scalar.TypeId]["dialect"], "standard">>
type RoleDialect = Assert<Equal<typeof role[Scalar.TypeId]["dialect"], "standard">>
type GroupedKind = Assert<Equal<Scalar.KindOf<typeof groupedLabel>, "aggregate">>

Executor.make().execute(Query.select({ label, role }).pipe(Query.from(users)))
Executor.make().execute(Query.select({ groupedLabel }).pipe(Query.from(users)))
// @ts-expect-error CASE must retain dependencies from its predicate
Executor.make().execute(Query.select({ label }))
// @ts-expect-error MATCH must retain dependencies from its subject
Executor.make().execute(Query.select({ role }))
