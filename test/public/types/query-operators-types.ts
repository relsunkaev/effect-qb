import * as StdRoot from "effect-qb"
import * as Std from "effect-qb"
import * as Mysql from "effect-qb/mysql"
import * as Postgres from "effect-qb/postgres"
import * as Sqlite from "effect-qb/sqlite"
import { Query as Q, Function as F } from "effect-qb"
import type { BrandedErrorOf } from "../../helpers/branded-error.ts"

const users = Std.Table.make("users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  email: Std.Column.text()
})

const posts = Std.Table.make("posts", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  userId: Std.Column.uuid(),
  title: Std.Column.text()
})

const predicateSurfacePlan = Q.select({
  userId: users.id
}).pipe(
  Q.from(users)
)

const predicateSurfaceApplied = Q.where(Q.and(
  Q.neq(users.email, "alice@example.com"),
  Q.like(users.email, "%@example.com")
))(predicateSurfacePlan)
void predicateSurfaceApplied

const zeroColumnSelectPlan = Q.select({}).pipe(Q.from(users))
void zeroColumnSelectPlan

const omittedSelectionPlan = Q.select().pipe(Q.from(users))
void omittedSelectionPlan

// @ts-expect-error select(...) expects a projection object
Q.select(Q.literal(1))

// @ts-expect-error nested selections must project at least one expression
Q.select({ nested: {} })

// @ts-expect-error distinctOn(...) requires at least one expression
Postgres.Query.distinctOn()

// @ts-expect-error groupBy(...) requires at least one expression
Q.groupBy()

// @ts-expect-error and(...) requires at least one predicate
Q.and()

// @ts-expect-error or(...) requires at least one predicate
Q.or()

// @ts-expect-error all(...) requires at least one predicate
Q.all()

// @ts-expect-error any(...) requires at least one predicate
Q.any()

// @ts-expect-error in(...) requires at least one candidate value
Q.in(users.email)

// @ts-expect-error notIn(...) requires at least one candidate value
Q.notIn(users.email)

// @ts-expect-error concat(...) requires at least two values
Q.concat(users.email)

// @ts-expect-error orderBy(...) direction must be asc or desc
Q.orderBy(users.email, "sideways")

declare const dynamicFunctionName: string
// @ts-expect-error standard function names must be literal strings
Std.Function.call(dynamicFunctionName, users.email)
// @ts-expect-error postgres function names must be literal strings
StdRoot.Function.call(dynamicFunctionName, users.email)
// @ts-expect-error mysql function names must be literal strings
StdRoot.Function.call(dynamicFunctionName, users.email)
// @ts-expect-error sqlite function names must be literal strings
StdRoot.Function.call(dynamicFunctionName, users.email)
// @ts-expect-error function names must be non-empty
F.call("", users.email)
// @ts-expect-error function names must be safe SQL identifiers
F.call("lower); drop table users; --", users.email)
// dotted function names are supported when every segment is safe
F.call("pg_catalog.lower", users.email)
// @ts-expect-error standard current_date calls do not accept arguments
Std.Function.call("current_date", users.email)
// @ts-expect-error postgres current_date calls do not accept arguments
StdRoot.Function.call("current_date", users.email)
// @ts-expect-error mysql current_date calls do not accept arguments
StdRoot.Function.call("current_date", users.email)
// @ts-expect-error sqlite current_date calls do not accept arguments
StdRoot.Function.call("current_date", users.email)
// @ts-expect-error extract calls require field and source arguments
F.call("extract", Q.literal("year"))
// @ts-expect-error extract calls require exactly field and source arguments
F.call("extract", Q.literal("year"), Q.literal(new Date("2024-01-02T03:04:05.000Z")), Q.literal(1))
// @ts-expect-error extract fields must be safe SQL identifiers
F.call("extract", Q.literal("year from now()); drop table users; --"), Q.literal(new Date("2024-01-02T03:04:05.000Z")))
F.call("extract", Q.literal("year"), Q.literal(new Date("2024-01-02T03:04:05.000Z")))

declare const dynamicCollation: string
// @ts-expect-error standard collation identifiers must be literal strings
Std.Query.collate(users.email, dynamicCollation)
// @ts-expect-error postgres collation identifiers must be literal strings
StdRoot.Query.collate(users.email, dynamicCollation)
// @ts-expect-error collation identifiers must be non-empty
Q.collate(users.email, "")
// @ts-expect-error collation path identifiers must be non-empty
Q.collate(users.email, ["pg_catalog", ""])

const predicateHelpersPlan = Q.select({
  distinctEmail: Q.isDistinctFrom(users.email, "alice@example.com"),
  sameEmail: Q.isNotDistinctFrom(users.email, "alice@example.com"),
  notInIds: Q.notIn(
    users.email,
    "alice@example.com",
    "bob@example.com",
    "carol@example.com"
  ),
  combined: Q.all(
    Q.eq(users.email, "alice@example.com"),
    Q.any(
      Q.eq(users.email, "alice@example.com"),
      Q.eq(users.email, "bob@example.com")
    )
  ),
  label: Q.match(users.email)
    .when("alice@example.com", "Alice")
    .when("bob@example.com", "Bob")
    .else("Other")
}).pipe(
  Q.from(users)
)

type PredicateHelpersRow = Q.ResultRow<typeof predicateHelpersPlan>
const predicateHelpersDistinct: PredicateHelpersRow["distinctEmail"] = true
const predicateHelpersSame: PredicateHelpersRow["sameEmail"] = true
const predicateHelpersNotIn: PredicateHelpersRow["notInIds"] = true
const predicateHelpersCombined: PredicateHelpersRow["combined"] = true
const predicateHelpersLabelValue: PredicateHelpersRow["label"] = "Other"
const predicateHelpersLabel: string = predicateHelpersLabelValue
void predicateHelpersDistinct
void predicateHelpersSame
void predicateHelpersNotIn
void predicateHelpersCombined
void predicateHelpersLabelValue
void predicateHelpersLabel

// @ts-expect-error incompatible comparison families should be rejected
Q.eq(users.id, users.email)

// @ts-expect-error incompatible membership family should be rejected
Q.in(users.id, users.email, StdRoot.Cast.to("00000000-0000-0000-0000-000000000010", Postgres.Type.uuid()))

Q.like(users.id, "%@example.com")

// @ts-expect-error incompatible simple-case comparison should be rejected
Q.match(users.id).when(users.email, "bad").else("ok")

const idAsText = StdRoot.Cast.to(users.id, Postgres.Type.text())
type IdAsText = StdRoot.Scalar.RuntimeOf<typeof idAsText>
const castRowId: IdAsText = "user-1"
void castRowId

// @ts-expect-error distinct is select-only
Q.distinct()(Q.delete(users))

// @ts-expect-error limit is select-only
Q.limit(5)(Q.update(users, {
  email: "updated@example.com"
}))

// @ts-expect-error update statements require at least one assignment
Q.update(users, {})

// @ts-expect-error offset is select-only
Q.offset(10)(Q.insert(users, {
  id: "user-id",
  email: "alice@example.com"
}))

const aliasPlan = Q.select({
  profile: {
    id: Q.as(users.id, "user_identifier"),
    email: Q.as(F.lower(users.email), "email_lower")
  }
}).pipe(
  Q.from(users)
)

type AliasRow = Q.ResultRow<typeof aliasPlan>
const aliasRow: AliasRow = {
  profile: {
    id: "user-1",
    email: "alice@example.com"
  }
}
void aliasRow
declare const dynamicProjectionAlias: string
// @ts-expect-error projection aliases must be literal strings
Q.as(users.id, dynamicProjectionAlias)
// @ts-expect-error projection aliases must be non-empty
Q.as(users.id, "")
// @ts-expect-error curried projection aliases must be literal strings
Q.as(dynamicProjectionAlias)(users.id)
// @ts-expect-error curried projection aliases must be non-empty
Q.as("")(users.id)

// @ts-expect-error selection projection aliases must be unique
Q.select({
  id: Q.as(users.id, "duplicate_alias"),
  email: Q.as(users.email, "duplicate_alias")
})

// @ts-expect-error selection projection aliases must be unique after path flattening
Q.select({
  "profile__id": users.id,
  profile: {
    id: users.email
  }
})

Q.insert(users, {
  id: "user-id",
  email: "alice@example.com"
}).pipe(
  // @ts-expect-error returning projection aliases must be unique
  Q.returning({
    id: Q.as(users.id, "duplicate_alias"),
    email: Q.as(users.email, "duplicate_alias")
  })
)

const postgresDistinctOnPlan = StdRoot.Query.select({
  id: users.id,
  email: users.email
}).pipe(
  StdRoot.Query.from(users),
  Postgres.Query.distinctOn(users.email),
  StdRoot.Query.orderBy(users.email),
  StdRoot.Query.orderBy(users.id)
)

type PostgresDistinctOnRow = StdRoot.Query.ResultRow<typeof postgresDistinctOnPlan>
const postgresDistinctOnEmail: PostgresDistinctOnRow["email"] = "alice@example.com"
void postgresDistinctOnEmail
void postgresDistinctOnPlan

const postgresDistinctOnMissingSource = StdRoot.Query.select({
  id: users.id
}).pipe(
  StdRoot.Query.from(users),
  Postgres.Query.distinctOn(posts.title)
)

// @ts-expect-error distinctOn expressions must be backed by available sources before rendering
const postgresDistinctOnMissingSourceRendered = Postgres.Renderer.make().render(postgresDistinctOnMissingSource)
void postgresDistinctOnMissingSourceRendered
