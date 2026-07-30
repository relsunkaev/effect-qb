import { Column, Function, Scalar, Table } from "effect-qb"
import * as My from "effect-qb/mysql"
import * as Pg from "effect-qb/postgres"
import * as Sq from "effect-qb/sqlite"

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
    (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false
type Assert<Value extends true> = Value

const users = Table.make("users", {
  id: Column.uuid(),
  email: Column.text()
})

const pgLower = Pg.Function.lower(users.email)
const myLower = My.Function.lower(users.email)
const sqLower = Sq.Function.lower(users.email)
type _PgLowerDialect = Assert<Equal<typeof pgLower[typeof Scalar.TypeId]["dialect"], "postgres">>
type _MyLowerDialect = Assert<Equal<typeof myLower[typeof Scalar.TypeId]["dialect"], "mysql">>
type _SqLowerDialect = Assert<Equal<typeof sqLower[typeof Scalar.TypeId]["dialect"], "sqlite">>

My.Function.lower(users.id)
Sq.Function.lower(users.id)
// @ts-expect-error PostgreSQL lower requires a character string database type
Pg.Function.lower(users.id)

const myLocalTime = My.Function.localTime()
type _MyLocalTimeDb = Assert<Equal<Scalar.DbTypeOf<typeof myLocalTime>["kind"], "datetime">>
type _MyLocalTimeRuntime = Assert<Equal<Scalar.RuntimeOf<typeof myLocalTime>, Scalar.LocalDateTimeString>>

const pgCurrentTimestamp = Pg.Function.currentTimestamp()
type _PgCurrentTimestampRuntime = Assert<Equal<Scalar.RuntimeOf<typeof pgCurrentTimestamp>, Scalar.InstantString>>

const sqCurrentTimestamp = Sq.Function.currentTimestamp()
type _SqCurrentTimestampRuntime = Assert<Equal<Scalar.RuntimeOf<typeof sqCurrentTimestamp>, Scalar.LocalDateTimeString>>

const frame = {
  orderBy: [{ value: users.id }],
  frame: {
    unit: "rows",
    start: { preceding: 1 },
    end: { preceding: 1 }
  }
} as const
const pgFirst = Pg.Function.firstValue(users.email, frame)
const myFirst = My.Function.firstValue(users.email, frame)
const sqFirst = Sq.Function.firstValue(users.email, frame)
type _PgFirstDialect = Assert<Equal<typeof pgFirst[typeof Scalar.TypeId]["dialect"], "postgres">>
type _MyFirstDialect = Assert<Equal<typeof myFirst[typeof Scalar.TypeId]["dialect"], "mysql">>
type _SqFirstDialect = Assert<Equal<typeof sqFirst[typeof Scalar.TypeId]["dialect"], "sqlite">>
// @ts-expect-error a MySQL expression cannot be framed by PostgreSQL
Pg.Function.firstValue(myLower, frame)

// @ts-expect-error case conversion is dialect-specific
Function.lower(users.email)
// @ts-expect-error clock functions are dialect-specific
Function.currentTimestamp()
