import * as Mysql from "../../src/mysql.ts"
import * as Postgres from "../../src/postgres.ts"
import { Column as C, Query as Q, Table } from "../../src/index.ts"
import type { BrandedErrorOf } from "../helpers/branded-error.ts"

const users = Table.make("users", {
  id: C.uuid().pipe(C.primaryKey),
  email: C.text()
})

const posts = Table.make("posts", {
  id: C.uuid().pipe(C.primaryKey),
  userId: C.uuid(),
  title: C.text()
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
Q.in(users.id, users.email, Q.cast("00000000-0000-0000-0000-000000000010", Q.type.uuid()))

// @ts-expect-error incompatible text operator family should be rejected
Q.like(users.id, "%@example.com")

// @ts-expect-error incompatible simple-case comparison should be rejected
Q.match(users.id).when(users.email, "bad").else("ok")

const castPlan = Q.select({
  idAsText: Q.cast(users.id, Q.type.text())
}).pipe(
  Q.from(users)
)

type CastPlanRow = Q.ResultRow<typeof castPlan>
const castRowId: CastPlanRow["idAsText"] = "user-1"
void castRowId

// @ts-expect-error distinct is select-only
Q.distinct()(Q.delete(users))

// @ts-expect-error limit is select-only
Q.limit(5)(Q.update(users, {
  email: "updated@example.com"
}))

// @ts-expect-error offset is select-only
Q.offset(10)(Q.insert(users, {
  id: "user-id",
  email: "alice@example.com"
}))

const aliasPlan = Q.select({
  profile: {
    id: Q.as(users.id, "user_identifier"),
    email: Q.as(Q.lower(users.email), "email_lower")
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

type MysqlDistinctOnError = BrandedErrorOf<typeof Mysql.Query.distinctOn>
const mysqlDistinctOnError: MysqlDistinctOnError =
  "effect-qb: distinctOn(...) is only supported by the postgres dialect"
void mysqlDistinctOnError
