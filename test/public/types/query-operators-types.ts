import * as Std from "effect-qb"
import * as Mysql from "effect-qb/mysql"
import * as Postgres from "effect-qb/postgres"
import { Query as Q, Function as F } from "effect-qb/postgres"
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
Q.in(users.id, users.email, Postgres.Cast.to("00000000-0000-0000-0000-000000000010", Postgres.Type.uuid()))

Q.like(users.id, "%@example.com")

// @ts-expect-error incompatible simple-case comparison should be rejected
Q.match(users.id).when(users.email, "bad").else("ok")

const idAsText = Postgres.Cast.to(users.id, Postgres.Type.text())
type IdAsText = Postgres.Scalar.RuntimeOf<typeof idAsText>
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

const postgresDistinctOnPlan = Postgres.Query.select({
  id: users.id,
  email: users.email
}).pipe(
  Postgres.Query.from(users),
  Postgres.Query.distinctOn(users.email),
  Postgres.Query.orderBy(users.email),
  Postgres.Query.orderBy(users.id)
)

type PostgresDistinctOnRow = Postgres.Query.ResultRow<typeof postgresDistinctOnPlan>
const postgresDistinctOnEmail: PostgresDistinctOnRow["email"] = "alice@example.com"
void postgresDistinctOnEmail
void postgresDistinctOnPlan

const postgresDistinctOnMissingSource = Postgres.Query.select({
  id: users.id
}).pipe(
  Postgres.Query.from(users),
  Postgres.Query.distinctOn(posts.title)
)

// @ts-expect-error distinctOn expressions must be backed by available sources before rendering
const postgresDistinctOnMissingSourceRendered = Postgres.Renderer.make().render(postgresDistinctOnMissingSource)
void postgresDistinctOnMissingSourceRendered

type MysqlDistinctOnError = BrandedErrorOf<typeof Mysql.Query.distinctOn>
const mysqlDistinctOnError: MysqlDistinctOnError =
  "effect-qb: distinctOn(...) is only supported by the postgres dialect"
void mysqlDistinctOnError
