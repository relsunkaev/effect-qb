import { Query as Q, Table, Column as C } from "../../src/mysql.ts"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text()
})

const plan = Q.select({
  varcharEmail: Q.cast(users.email, Q.type.varchar()),
  datetimeValue: Q.cast("2026-03-18T10:00:00Z", Q.type.datetime()),
  blobValue: Q.cast("deadbeef", Q.type.blob()),
  bigIntValue: Q.cast(1, Q.type.bigint())
}).pipe(
  Q.from(users)
)

type Row = Q.ResultRow<typeof plan>
const varcharEmail: Row["varcharEmail"] = "alice@example.com"
const datetimeValue: Row["datetimeValue"] = new Date()
const blobValue: Row["blobValue"] = new Uint8Array()
const bigIntValue: Row["bigIntValue"] = 1n
void varcharEmail
void datetimeValue
void blobValue
void bigIntValue

const varcharEmailExpr = Q.cast(users.email, Q.type.varchar())
const charEmailExpr = Q.cast("alice@example.com", Q.type.char())

const comparablePlan = Q.select({
  sameTextFamily: Q.eq(varcharEmailExpr, charEmailExpr)
}).pipe(
  Q.from(users)
)

type ComparableRow = Q.ResultRow<typeof comparablePlan>
const sameTextFamily: ComparableRow["sameTextFamily"] = true
void sameTextFamily

const datetimeLeft = Q.cast("2026-03-18", Q.type.datetime())
const datetimeRight = Q.cast("2026-03-18T10:00:00Z", Q.type.datetime())

const temporalPlan = Q.select({
  sameTemporal: Q.eq(datetimeLeft, datetimeRight)
})

type TemporalRow = Q.ResultRow<typeof temporalPlan>
const sameTemporal: TemporalRow["sameTemporal"] = true
void sameTemporal

const decimalLeft = Q.cast(1, Q.type.custom("decimal(10,2)"))
const decimalRight = Q.cast(2, Q.type.custom("decimal(10,2)"))

const customPlan = Q.select({
  scaledValue: decimalLeft,
  scaledMatch: Q.eq(decimalLeft, decimalRight)
})

type CustomRow = Q.ResultRow<typeof customPlan>
const scaledValue: CustomRow["scaledValue"] = 1
const scaledMatch: CustomRow["scaledMatch"] = true
void scaledValue
void scaledMatch

const enumLeft = Q.cast("draft", Q.type.enum("enum('draft','published')"))
const enumRight = Q.cast("published", Q.type.enum("enum('draft','published')"))

const customEnumPlan = Q.select({
  enumMatch: Q.eq(enumLeft, enumRight),
  setValue: Q.cast("admin", Q.type.set("set('admin','editor')"))
})

type CustomEnumRow = Q.ResultRow<typeof customEnumPlan>
const enumMatch: CustomEnumRow["enumMatch"] = true
const setValue: CustomEnumRow["setValue"] = "admin"
void enumMatch
void setValue

// @ts-expect-error incompatible enum kinds should be rejected
Q.eq(Q.cast("draft", Q.type.enum("enum('draft','published')")), Q.cast("published", Q.type.enum("enum('review','archived')")))
