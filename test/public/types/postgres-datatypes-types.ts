import { Column as PgColumn } from "effect-qb/postgres"
import * as Std from "effect-qb"
import * as Pg from "effect-qb/postgres"
import { Query as Q, Scalar as E } from "effect-qb"
import * as Schema from "effect/Schema"

const users = Std.Table.make("users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  email: Std.Column.text()
})

const status = Pg.enum("status", ["pending", "active"])
const scopedStatus = Pg.Schema.make("public").enum("status", ["pending", "active"])
const quotedStatus = Pg.Schema.make("audit\"schema").enum("status\"type", ["active"])
type StatusValues = typeof status.values
type ScopedStatusValues = typeof scopedStatus.values
const statusValues: StatusValues = ["pending", "active"]
const scopedStatusValues: ScopedStatusValues = ["pending", "active"]
const quotedStatusKind: ReturnType<typeof quotedStatus.type>["kind"] = "\"audit\"\"schema\".\"status\"\"type\""
void status
void scopedStatus
void quotedStatus
void statusValues
void scopedStatusValues
void quotedStatusKind

const builtinColumns = Std.Table.make("builtin_columns", {
  shortName: Std.Column.varchar(32),
  code: Std.Column.char(1),
  amount: Std.Column.number({ precision: 10, scale: 4 }),
  payload: PgColumn.jsonb(Schema.Struct({
    ok: Schema.Boolean
  })),
  tags: Std.Column.text().pipe(PgColumn.array()),
  nullableTags: Std.Column.text().pipe(PgColumn.array({ nullableElements: true })),
  quantity: PgColumn.int8(),
  createdAt: PgColumn.timestamptz()
})

const auditSeq = Pg.sequence("awsdms_ddl_audit_c_key_seq")
const scopedAuditSeq = Pg.Schema.make("audit").sequence("awsdms_ddl_audit_c_key_seq")
const sequenceDefaultColumn = PgColumn.int8().pipe(
  Std.Column.default(Pg.Function.nextVal(auditSeq))
)
const scopedSequenceDefaultColumn = PgColumn.int8().pipe(
  Std.Column.default(Pg.Function.nextVal(scopedAuditSeq))
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

const varcharEmailExpr = Std.Cast.to(users.email, Pg.Type.varchar())
const citextEmailExpr = Std.Cast.to(users.email, Pg.Type.citext())
const dateValueExpr = Std.Cast.to("2026-03-18", Pg.Type.date())
const binaryValueExpr = Std.Cast.to("deadbeef", Pg.Type.bytea())
const jsonbValueExpr = Std.Cast.to("{}", Pg.Type.jsonb())

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

const sizedEmailExpr = Std.Cast.to(users.email, Pg.Type.custom("varchar(255)"))
const sizedMatchExpr = Q.eq(users.email, "alice@example.com")

// @ts-expect-error custom db type names must be non-empty
Pg.Type.custom("")

const sizedEmail: E.RuntimeOf<typeof sizedEmailExpr> = "alice@example.com"
const sizedMatch: E.RuntimeOf<typeof sizedMatchExpr> = true
void sizedEmail
void sizedMatch

const textArrayExpr = Std.Cast.to("{}", Pg.Type.array(Pg.Type.text()))
const textArray: E.RuntimeOf<typeof textArrayExpr> = [] as readonly string[]
void textArray

const nestedTextArrayExpr = Std.Cast.to("{}", Pg.Type.array(Pg.Type.array(Pg.Type.text())))
const intRangeExpr = Std.Cast.to("empty", Pg.Type.range("int4range", Pg.Type.int4()))
const intMultiRangeExpr = Std.Cast.to("empty", Pg.Type.multirange("int4multirange", Pg.Type.range("int4range", Pg.Type.int4())))
const profileExpr = Std.Cast.to("{}", Pg.Type.record("user_profile", {
  displayName: Pg.Type.text(),
  age: Pg.Type.int4()
}))
const domainEmailExpr = Std.Cast.to(users.email, Pg.Type.domain("email_domain", Pg.Type.text()))
const enumStatusExpr = Std.Cast.to("status_enum", Pg.Type.enum("status_enum"))

// @ts-expect-error range db type names must be non-empty
Pg.Type.range("", Pg.Type.int4())
// @ts-expect-error multirange db type names must be non-empty
Pg.Type.multirange("", Pg.Type.range("int4range", Pg.Type.int4()))
// @ts-expect-error record db type names must be non-empty
Pg.Type.record("", {
  displayName: Pg.Type.text()
})
// @ts-expect-error domain db type names must be non-empty
Pg.Type.domain("", Pg.Type.text())
// @ts-expect-error enum db type names must be non-empty
Pg.Type.enum("")
// @ts-expect-error set db type names must be non-empty
Pg.Type.set("")

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

const comparableTextArrayExpr = Std.Cast.to("{}", Pg.Type.array(Pg.Type.text()))
const comparableIntRangeExpr = Std.Cast.to("int4range(1,10)", Pg.Type.range("int4range", Pg.Type.int4()))
const otherComparableIntRangeExpr = Std.Cast.to("int4range(5,15)", Pg.Type.range("int4range", Pg.Type.int4()))
const arrayContainsExpr = Q.contains(comparableTextArrayExpr, comparableTextArrayExpr)
const rangeOverlapExpr = Q.overlaps(comparableIntRangeExpr, otherComparableIntRangeExpr)

const arrayContains: E.RuntimeOf<typeof arrayContainsExpr> = true
const rangeOverlap: E.RuntimeOf<typeof rangeOverlapExpr> = true
void arrayContains
void rangeOverlap

// @ts-expect-error incompatible container kinds should be rejected
Q.contains(comparableTextArrayExpr, Std.Cast.to("{}", Pg.Type.array(Pg.Type.uuid())))
