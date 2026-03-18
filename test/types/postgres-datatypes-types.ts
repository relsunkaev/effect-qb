import { Query as Q, Table, Column as C } from "../../src/postgres.ts"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text()
})

const plan = Q.select({
  varcharEmail: Q.cast(users.email, Q.type.varchar()),
  citextEmail: Q.cast(users.email, Q.type.citext()),
  dateValue: Q.cast("2026-03-18", Q.type.date()),
  binaryValue: Q.cast("deadbeef", Q.type.bytea()),
  jsonbValue: Q.cast("{}", Q.type.jsonb())
}).pipe(
  Q.from(users)
)

type Row = Q.ResultRow<typeof plan>
const varcharEmail: Row["varcharEmail"] = "alice@example.com"
const citextEmail: Row["citextEmail"] = "alice@example.com"
const dateValue: Row["dateValue"] = new Date()
const binaryValue: Row["binaryValue"] = new Uint8Array()
const jsonbValue: Row["jsonbValue"] = {} as unknown
void varcharEmail
void citextEmail
void dateValue
void binaryValue
void jsonbValue

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
    Q.cast("2026-03-18", Q.type.timestamp()),
    Q.cast("2026-03-18T00:00:00Z", Q.type.timestamp())
  )
})

type TemporalRow = Q.ResultRow<typeof temporalPlan>
const sameTemporal: TemporalRow["sameTemporal"] = true
void sameTemporal

const customPlan = Q.select({
  sizedEmail: Q.cast(users.email, Q.type.custom("varchar(255)")),
  sizedMatch: Q.eq(
    Q.cast(users.email, Q.type.custom("varchar(255)")),
    Q.cast("alice@example.com", Q.type.custom("varchar(255)"))
  )
}).pipe(
  Q.from(users)
)

type CustomRow = Q.ResultRow<typeof customPlan>
const sizedEmail: CustomRow["sizedEmail"] = "alice@example.com"
const sizedMatch: CustomRow["sizedMatch"] = true
void sizedEmail
void sizedMatch

const customArrayPlan = Q.select({
  textArray: Q.cast("{}", Q.type.custom("text[]"))
})

type CustomArrayRow = Q.ResultRow<typeof customArrayPlan>
const textArray: CustomArrayRow["textArray"] = [] as readonly unknown[]
void textArray
