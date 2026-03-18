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

const comparablePlan = Q.select({
  sameTextFamily: Q.eq(
    Q.cast(users.email, Q.type.varchar()),
    Q.cast("alice@example.com", Q.type.char())
  )
}).pipe(
  Q.from(users)
)

type ComparableRow = Q.ResultRow<typeof comparablePlan>
const sameTextFamily: ComparableRow["sameTextFamily"] = true
void sameTextFamily

const temporalPlan = Q.select({
  sameTemporal: Q.eq(
    Q.cast("2026-03-18", Q.type.datetime()),
    Q.cast("2026-03-18T10:00:00Z", Q.type.datetime())
  )
})

type TemporalRow = Q.ResultRow<typeof temporalPlan>
const sameTemporal: TemporalRow["sameTemporal"] = true
void sameTemporal

const customPlan = Q.select({
  scaledValue: Q.cast(1, Q.type.custom("decimal(10,2)")),
  scaledMatch: Q.eq(
    Q.cast(1, Q.type.custom("decimal(10,2)")),
    Q.cast(2, Q.type.custom("decimal(10,2)"))
  )
})

type CustomRow = Q.ResultRow<typeof customPlan>
const scaledValue: CustomRow["scaledValue"] = 1
const scaledMatch: CustomRow["scaledMatch"] = true
void scaledValue
void scaledMatch

const customEnumPlan = Q.select({
  enumMatch: Q.eq(
    Q.cast("draft", Q.type.custom("enum('draft','published')")),
    Q.cast("published", Q.type.custom("enum('draft','published')"))
  )
})

type CustomEnumRow = Q.ResultRow<typeof customEnumPlan>
const enumMatch: CustomEnumRow["enumMatch"] = true
void enumMatch
