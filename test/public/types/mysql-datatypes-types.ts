import * as Std from "effect-qb"
import * as My from "effect-qb/mysql"
import { Query as Q, Scalar as E } from "effect-qb"

const users = Std.Table.make("users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  email: Std.Column.text()
})

// @ts-expect-error portable text types come from the root Type namespace
My.Type.text()
// @ts-expect-error portable json types come from the root Type namespace
My.Type.json()
// @ts-expect-error portable datetime types come from the root Type namespace
My.Type.datetime()

const plan = Q.select({
  varcharEmail: Q.cast(users.email, Std.Type.varchar()),
  datetimeValue: Q.cast("2026-03-18T10:00:00Z", Std.Type.datetime()),
  blobValue: Q.cast("deadbeef", Std.Type.blob()),
  bigIntValue: Q.cast(1, Std.Type.bigint())
}).pipe(
  Q.from(users)
)

type Row = Q.ResultRow<typeof plan>
const varcharEmail: Row["varcharEmail"] = "alice@example.com"
const datetimeValue: Row["datetimeValue"] = "2026-03-18T10:00:00" as E.LocalDateTimeString
const blobValue: Row["blobValue"] = new Uint8Array()
const bigIntValue: Row["bigIntValue"] = "1" as E.BigIntString
void varcharEmail
void datetimeValue
void blobValue
void bigIntValue

const varcharEmailExpr = Q.cast(users.email, Std.Type.varchar())
const charEmailExpr = Q.cast("alice@example.com", Std.Type.char())

const comparablePlan = Q.select({
  sameTextFamily: Q.eq(varcharEmailExpr, charEmailExpr)
}).pipe(
  Q.from(users)
)

type ComparableRow = Q.ResultRow<typeof comparablePlan>
const sameTextFamily: ComparableRow["sameTextFamily"] = true
void sameTextFamily

const datetimeLeft = Q.cast("2026-03-18", Std.Type.datetime())
const datetimeRight = Q.cast("2026-03-18T10:00:00Z", Std.Type.datetime())

const temporalPlan = Q.select({
  sameTemporal: Q.eq(datetimeLeft, datetimeRight)
})

type TemporalRow = Q.ResultRow<typeof temporalPlan>
const sameTemporal: TemporalRow["sameTemporal"] = true
void sameTemporal

const decimalLeft = Q.cast(1, My.Type.custom("decimal(10,2)"))
const decimalRight = Q.cast(2, My.Type.custom("decimal(10,2)"))

// @ts-expect-error MySQL custom db type names must be non-empty
My.Type.custom("")

const customPlan = Q.select({
  scaledValue: decimalLeft,
  scaledMatch: Q.eq(decimalLeft, decimalRight)
})

type CustomRow = Q.ResultRow<typeof customPlan>
const scaledValue: CustomRow["scaledValue"] = "1" as E.DecimalString
const scaledMatch: CustomRow["scaledMatch"] = true
void scaledValue
void scaledMatch

const enumLeft = Q.cast("draft", My.Type.enum("enum('draft','published')"))
const enumRight = Q.cast("published", My.Type.enum("enum('draft','published')"))

// @ts-expect-error MySQL enum db type names must be non-empty
My.Type.enum("")
// @ts-expect-error MySQL set db type names must be non-empty
My.Type.set("")

const customEnumPlan = Q.select({
  enumMatch: Q.eq(enumLeft, enumRight),
  setValue: Q.cast("admin", My.Type.set("set('admin','editor')"))
})

type CustomEnumRow = Q.ResultRow<typeof customEnumPlan>
const enumMatch: CustomEnumRow["enumMatch"] = true
const setValue: CustomEnumRow["setValue"] = "admin"
void enumMatch
void setValue

// @ts-expect-error incompatible enum kinds should be rejected
Q.eq(Q.cast("draft", My.Type.enum("enum('draft','published')")), Q.cast("published", My.Type.enum("enum('review','archived')")))
