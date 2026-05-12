import * as Mysql from "effect-qb/mysql"
import * as Postgres from "effect-qb/postgres"
import { Column as C, Query as Q, Table } from "effect-qb/postgres"
import type { BrandedErrorOf, BrandedHintOf } from "../../helpers/branded-error.ts"

type IsExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
    (<T>() => T extends B ? 1 : 2)
    ? (<T>() => T extends B ? 1 : 2) extends
        (<T>() => T extends A ? 1 : 2)
      ? true
      : false
    : false

type Assert<T extends true> = T

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text()
})

const active = Q.select({
  email: users.email
}).pipe(
  Q.from(users)
)

const archived = Q.select({
  email: users.email
}).pipe(
  Q.from(users)
)

const unionAllPlan = Q.unionAll(active, archived)
const intersectAllPlan = Q.intersectAll(active, archived)
const exceptAllPlan = Q.exceptAll(active, archived)

type UnionAllRow = Q.ResultRow<typeof unionAllPlan>
type IntersectAllRow = Q.ResultRow<typeof intersectAllPlan>
type ExceptAllRow = Q.ResultRow<typeof exceptAllPlan>

const unionAllEmail: UnionAllRow["email"] = "alice@example.com"
const intersectAllEmail: IntersectAllRow["email"] = "alice@example.com"
const exceptAllEmail: ExceptAllRow["email"] = "alice@example.com"
void unionAllEmail
void intersectAllEmail
void exceptAllEmail

const valuesSource = Postgres.Query.values([
  { id: Postgres.Query.literal(1), email: Postgres.Query.literal("alice@example.com") },
  { id: Postgres.Query.literal(2), email: Postgres.Query.literal("bob@example.com") }
] as const).pipe(Postgres.Query.as("seed"))

const valuesPlan = Postgres.Query.select({
  id: valuesSource.id,
  email: valuesSource.email
}).pipe(
  Postgres.Query.from(valuesSource)
)

type ValuesRow = Q.ResultRow<typeof valuesPlan>
type ValuesStatement = Q.StatementOfPlan<typeof valuesPlan>
const valuesId: ValuesRow["id"] = 1
const valuesEmail: ValuesRow["email"] = "alice@example.com"
type _AssertValuesStatement = Assert<IsExact<ValuesStatement, "select">>
// @ts-expect-error values row ids stay numeric literals
const badValuesId: ValuesRow["id"] = "wrong"
void badValuesId
void valuesId
void valuesEmail

const unnestSource = Postgres.Query.unnest({
  id: [Postgres.Query.literal(1), Postgres.Query.literal(2)] as const,
  email: [Postgres.Query.literal("alice@example.com"), Postgres.Query.literal("bob@example.com")] as const
}, "seed_rows")

const unnestPlan = Postgres.Query.select({
  id: unnestSource.id,
  email: unnestSource.email
}).pipe(
  Postgres.Query.from(unnestSource)
)

type UnnestRow = Q.ResultRow<typeof unnestPlan>
type UnnestStatement = Q.StatementOfPlan<typeof unnestPlan>
const unnestId: UnnestRow["id"] = 1
const unnestEmail: UnnestRow["email"] = "bob@example.com"
type _AssertUnnestStatement = Assert<IsExact<UnnestStatement, "select">>
// @ts-expect-error unnest row ids stay numeric literals
const badUnnestId: UnnestRow["id"] = "wrong"
void badUnnestId
void unnestId
void unnestEmail

const seriesSource = Postgres.Query.generateSeries(1, 3, 1, "series")
const seriesPlan = Postgres.Query.select({
  value: seriesSource.value
}).pipe(
  Postgres.Query.from(seriesSource)
)

type SeriesRow = Q.ResultRow<typeof seriesPlan>
type SeriesStatement = Q.StatementOfPlan<typeof seriesPlan>
const seriesValue: SeriesRow["value"] = 1
type _AssertSeriesStatement = Assert<IsExact<SeriesStatement, "select">>
// @ts-expect-error generateSeries rows stay numeric literals
const badSeriesValue: SeriesRow["value"] = "wrong"
void badSeriesValue
void seriesValue

const scalarPlan = Postgres.Query.select({
  value: Postgres.Query.scalar(
    Postgres.Query.select({
      value: users.id
    }).pipe(
      Postgres.Query.from(users)
    )
  ),
  inSubqueryValue: Postgres.Query.inSubquery(
    users.id,
    Postgres.Query.select({
      value: users.id
    }).pipe(
      Postgres.Query.from(users)
    )
  )
}).pipe(
  Postgres.Query.from(users)
)

type ScalarRow = Q.ResultRow<typeof scalarPlan>
const scalarValue: ScalarRow["value"] = "user-id"
const scalarNull: ScalarRow["value"] = null
const scalarInValue: ScalarRow["inSubqueryValue"] = true
void scalarValue
void scalarNull
void scalarInValue

const groupedSubqueryIds = Postgres.Query.select({
  value: users.id
}).pipe(
  Postgres.Query.from(users)
)
const groupedInSubqueryValue = Postgres.Query.inSubquery(users.id, groupedSubqueryIds)
const groupedInSubqueryPlan = Postgres.Query.select({
  matchesAny: groupedInSubqueryValue,
  rowCount: Postgres.Function.count(users.id)
}).pipe(
  Postgres.Query.from(users),
  Postgres.Query.groupBy(groupedInSubqueryValue)
)

const completeGroupedInSubqueryPlan: Postgres.Query.CompletePlan<typeof groupedInSubqueryPlan> =
  groupedInSubqueryPlan
void completeGroupedInSubqueryPlan

const mysqlValuesSource = Mysql.Query.values([
  { id: Mysql.Query.literal(1), email: Mysql.Query.literal("alice@example.com") },
  { id: Mysql.Query.literal(2), email: Mysql.Query.literal("bob@example.com") }
] as const).pipe(Mysql.Query.as("seed"))

const mysqlValuesPlan = Mysql.Query.select({
  id: mysqlValuesSource.id,
  email: mysqlValuesSource.email
}).pipe(
  Mysql.Query.from(mysqlValuesSource)
)

type MysqlValuesRow = Mysql.Query.ResultRow<typeof mysqlValuesPlan>
type MysqlValuesStatement = Mysql.Query.StatementOfPlan<typeof mysqlValuesPlan>
const mysqlValuesId: MysqlValuesRow["id"] = 1
const mysqlValuesEmail: MysqlValuesRow["email"] = "alice@example.com"
type _AssertMysqlValuesStatement = Assert<IsExact<MysqlValuesStatement, "select">>
// @ts-expect-error mysql values row ids stay numeric literals
const badMysqlValuesId: MysqlValuesRow["id"] = "wrong"
void badMysqlValuesId
void mysqlValuesId
void mysqlValuesEmail

const mysqlUnnestSource = Mysql.Query.unnest({
  id: [Mysql.Query.literal(1), Mysql.Query.literal(2)] as const,
  email: [Mysql.Query.literal("alice@example.com"), Mysql.Query.literal("bob@example.com")] as const
}, "seed_rows")

const mysqlUnnestPlan = Mysql.Query.select({
  id: mysqlUnnestSource.id,
  email: mysqlUnnestSource.email
}).pipe(
  Mysql.Query.from(mysqlUnnestSource)
)

type MysqlUnnestRow = Mysql.Query.ResultRow<typeof mysqlUnnestPlan>
type MysqlUnnestStatement = Mysql.Query.StatementOfPlan<typeof mysqlUnnestPlan>
const mysqlUnnestId: MysqlUnnestRow["id"] = 1
const mysqlUnnestEmail: MysqlUnnestRow["email"] = "bob@example.com"
type _AssertMysqlUnnestStatement = Assert<IsExact<MysqlUnnestStatement, "select">>
// @ts-expect-error mysql unnest row ids stay numeric literals
const badMysqlUnnestId: MysqlUnnestRow["id"] = "wrong"
void badMysqlUnnestId
void mysqlUnnestId
void mysqlUnnestEmail

const mysqlSeries = Mysql.Query.generateSeries(1, 3)

type MysqlSeriesError = BrandedErrorOf<typeof mysqlSeries>
type MysqlSeriesHint = BrandedHintOf<typeof mysqlSeries>
const mysqlSeriesError: MysqlSeriesError = "effect-qb: generateSeries(...) is only supported by the postgres dialect"
const mysqlSeriesHint: MysqlSeriesHint = "Use postgres.Query.generateSeries(...) or emulate a series with a recursive CTE"
void mysqlSeriesError
void mysqlSeriesHint

void unionAllPlan
void intersectAllPlan
void exceptAllPlan
void valuesPlan
void unnestPlan
void seriesPlan
void scalarPlan
void mysqlValuesPlan
void mysqlUnnestPlan
void mysqlSeries
