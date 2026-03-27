import * as Pg from "effect-qb/postgres"
import { Query as Q, Table, Column as C, Scalar as E } from "effect-qb/postgres"
import * as Schema from "effect/Schema"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text()
})

const status = Pg.enum("status", ["pending", "active"])
const scopedStatus = Pg.schema("public").enum("status", ["pending", "active"])
type StatusValues = typeof status.values
type ScopedStatusValues = typeof scopedStatus.values
const statusValues: StatusValues = ["pending", "active"]
const scopedStatusValues: ScopedStatusValues = ["pending", "active"]
void status
void scopedStatus
void statusValues
void scopedStatusValues

const builtinColumns = Table.make("builtin_columns", {
  shortName: C.varchar(32),
  code: C.char(1),
  amount: C.number({ precision: 10, scale: 4 }),
  payload: C.jsonb(Schema.Struct({
    ok: Schema.Boolean
  })),
  tags: C.text().pipe(C.array()),
  nullableTags: C.text().pipe(C.array({ nullableElements: true })),
  quantity: C.int8(),
  createdAt: C.timestamptz()
})

const auditSeq = Pg.sequence("awsdms_ddl_audit_c_key_seq")
const scopedAuditSeq = Pg.schema("audit").sequence("awsdms_ddl_audit_c_key_seq")
const sequenceDefaultColumn = C.int8().pipe(
  C.default(Pg.Function.nextVal(auditSeq))
)
const scopedSequenceDefaultColumn = C.int8().pipe(
  C.default(Pg.Function.nextVal(scopedAuditSeq))
)
void auditSeq
void scopedAuditSeq
void sequenceDefaultColumn
void scopedSequenceDefaultColumn

const builtinArrayPlan = Q.select({
  tags: builtinColumns.tags
}).pipe(
  Q.from(builtinColumns)
)

const builtinNullableArrayPlan = Q.select({
  nullableTags: builtinColumns.nullableTags
}).pipe(
  Q.from(builtinColumns)
)

type BuiltinArrayRow = Q.ResultRow<typeof builtinArrayPlan>
type BuiltinNullableArrayRow = Q.ResultRow<typeof builtinNullableArrayPlan>
const tags: BuiltinArrayRow["tags"] = [] as readonly string[]
const nullableTags: BuiltinNullableArrayRow["nullableTags"] = [] as readonly (string | null)[]
void builtinArrayPlan
void builtinNullableArrayPlan
void tags
void nullableTags
void builtinColumns

const varcharEmailExpr = Pg.Cast.to(users.email, Pg.Type.varchar())
const citextEmailExpr = Pg.Cast.to(users.email, Pg.Type.citext())
const dateValueExpr = Pg.Cast.to("2026-03-18", Pg.Type.date())
const binaryValueExpr = Pg.Cast.to("deadbeef", Pg.Type.bytea())
const jsonbValueExpr = Pg.Cast.to("{}", Pg.Type.jsonb())

const varcharEmail: E.RuntimeOf<typeof varcharEmailExpr> = "alice@example.com"
const citextEmail: E.RuntimeOf<typeof citextEmailExpr> = "alice@example.com"
const dateValue: E.RuntimeOf<typeof dateValueExpr> = "2026-03-18" as E.LocalDateString
const binaryValue: E.RuntimeOf<typeof binaryValueExpr> = new Uint8Array()
const jsonbValue: E.RuntimeOf<typeof jsonbValueExpr> = {
  ok: true
} as E.JsonValue
void varcharEmail
void citextEmail
void dateValue
void binaryValue
void jsonbValue

const comparablePlan = Q.select({
  sameTextFamily: Q.eq(
    users.email,
    "alice@example.com"
  )
}).pipe(
  Q.from(users)
)

type ComparableRow = Q.ResultRow<typeof comparablePlan>
const sameTextFamily: ComparableRow["sameTextFamily"] = true
void sameTextFamily

const temporalPlan = Q.select({
  sameTemporal: Q.eq(
    "2026-03-18",
    "2026-03-18"
  )
})

type TemporalRow = Q.ResultRow<typeof temporalPlan>
const sameTemporal: TemporalRow["sameTemporal"] = true
void sameTemporal

const sizedEmailExpr = Pg.Cast.to(users.email, Pg.Type.custom("varchar(255)"))
const sizedMatchExpr = Q.eq(users.email, "alice@example.com")

const sizedEmail: E.RuntimeOf<typeof sizedEmailExpr> = "alice@example.com"
const sizedMatch: E.RuntimeOf<typeof sizedMatchExpr> = true
void sizedEmail
void sizedMatch

const textArrayExpr = Pg.Cast.to("{}", Pg.Type.array(Pg.Type.text()))
const textArray: E.RuntimeOf<typeof textArrayExpr> = [] as readonly string[]
void textArray

const nestedTextArrayExpr = Pg.Cast.to("{}", Pg.Type.array(Pg.Type.array(Pg.Type.text())))
const intRangeExpr = Pg.Cast.to("empty", Pg.Type.range("int4range", Pg.Type.int4()))
const intMultiRangeExpr = Pg.Cast.to("empty", Pg.Type.multirange("int4multirange", Pg.Type.range("int4range", Pg.Type.int4())))
const profileExpr = Pg.Cast.to("{}", Pg.Type.record("user_profile", {
  displayName: Pg.Type.text(),
  age: Pg.Type.int4()
}))
const domainEmailExpr = Pg.Cast.to(users.email, Pg.Type.domain("email_domain", Pg.Type.text()))
const enumStatusExpr = Pg.Cast.to("status_enum", Pg.Type.enum("status_enum"))

const nestedTextArray: E.RuntimeOf<typeof nestedTextArrayExpr> = [[]]
const intRange: E.RuntimeOf<typeof intRangeExpr> = {} as unknown
const intMultiRange: E.RuntimeOf<typeof intMultiRangeExpr> = {} as unknown
const profile: E.RuntimeOf<typeof profileExpr> = { displayName: "Alice", age: 42 }
const domainEmail: E.RuntimeOf<typeof domainEmailExpr> = "alice@example.com"
const enumStatus: E.RuntimeOf<typeof enumStatusExpr> = "status_enum"
void nestedTextArray
void intRange
void intMultiRange
void profile
void domainEmail
void enumStatus

const comparableTextArrayExpr = Pg.Cast.to("{}", Pg.Type.array(Pg.Type.text()))
const comparableIntRangeExpr = Pg.Cast.to("int4range(1,10)", Pg.Type.range("int4range", Pg.Type.int4()))
const otherComparableIntRangeExpr = Pg.Cast.to("int4range(5,15)", Pg.Type.range("int4range", Pg.Type.int4()))
const arrayContainsExpr = Q.contains(comparableTextArrayExpr, comparableTextArrayExpr)
const rangeOverlapExpr = Q.overlaps(comparableIntRangeExpr, otherComparableIntRangeExpr)

const arrayContains: E.RuntimeOf<typeof arrayContainsExpr> = true
const rangeOverlap: E.RuntimeOf<typeof rangeOverlapExpr> = true
void arrayContains
void rangeOverlap

// @ts-expect-error incompatible container kinds should be rejected
Q.contains(comparableTextArrayExpr, Pg.Cast.to("{}", Pg.Type.array(Pg.Type.uuid())))
