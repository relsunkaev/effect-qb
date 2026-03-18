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
  textArray: Q.cast("{}", Q.type.array(Q.type.text()))
})

type CustomArrayRow = Q.ResultRow<typeof customArrayPlan>
const textArray: CustomArrayRow["textArray"] = [] as readonly string[]
void textArray

const structuredPlan = Q.select({
  nestedTextArray: Q.cast("{}", Q.type.array(Q.type.array(Q.type.text()))),
  intRange: Q.cast("empty", Q.type.range("int4range", Q.type.int4())),
  intMultiRange: Q.cast("empty", Q.type.multirange("int4multirange", Q.type.range("int4range", Q.type.int4()))),
  profile: Q.cast("{}", Q.type.record("user_profile", {
    displayName: Q.type.text(),
    age: Q.type.int4()
  })),
  domainEmail: Q.cast(users.email, Q.type.domain("email_domain", Q.type.text())),
  enumStatus: Q.cast("status_enum", Q.type.enum("status_enum"))
}).pipe(
  Q.from(users)
)

type StructuredRow = Q.ResultRow<typeof structuredPlan>
const nestedTextArray: StructuredRow["nestedTextArray"] = [[]]
const intRange: StructuredRow["intRange"] = {} as unknown
const intMultiRange: StructuredRow["intMultiRange"] = {} as unknown
const profile: StructuredRow["profile"] = { displayName: "Alice", age: 42 }
const domainEmail: StructuredRow["domainEmail"] = "alice@example.com"
const enumStatus: StructuredRow["enumStatus"] = "status_enum"
void nestedTextArray
void intRange
void intMultiRange
void profile
void domainEmail
void enumStatus

const textArrayExpr = Q.cast("{}", Q.type.array(Q.type.text()))
const intRangeExpr = Q.cast("int4range(1,10)", Q.type.range("int4range", Q.type.int4()))
const otherIntRangeExpr = Q.cast("int4range(5,15)", Q.type.range("int4range", Q.type.int4()))

const containerPlan = Q.select({
  arrayContains: Q.contains(textArrayExpr, textArrayExpr),
  rangeOverlap: Q.overlaps(intRangeExpr, otherIntRangeExpr)
})

type ContainerRow = Q.ResultRow<typeof containerPlan>
const arrayContains: ContainerRow["arrayContains"] = true
const rangeOverlap: ContainerRow["rangeOverlap"] = true
void arrayContains
void rangeOverlap

// @ts-expect-error incompatible container kinds should be rejected
Q.contains(textArrayExpr, Q.cast("{}", Q.type.array(Q.type.uuid())))
