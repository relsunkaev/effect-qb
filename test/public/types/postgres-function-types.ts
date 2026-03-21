import * as Postgres from "effect-qb/postgres"

type IsExact<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
    (<T>() => T extends B ? 1 : 2)
    ? (<T>() => T extends B ? 1 : 2) extends
        (<T>() => T extends A ? 1 : 2)
      ? true
      : false
    : false

type Assert<T extends true> = T

const currentDate = Postgres.Function.currentDate()
const currentTime = Postgres.Function.currentTime()
const currentTimestamp = Postgres.Function.currentTimestamp()
const localTime = Postgres.Function.localTime()
const localTimestamp = Postgres.Function.localTimestamp()
const now = Postgres.Function.now()

type CurrentDateRuntime = Postgres.Expression.RuntimeOf<typeof currentDate>
type CurrentTimeRuntime = Postgres.Expression.RuntimeOf<typeof currentTime>
type CurrentTimestampRuntime = Postgres.Expression.RuntimeOf<typeof currentTimestamp>
type LocalTimeRuntime = Postgres.Expression.RuntimeOf<typeof localTime>
type LocalTimestampRuntime = Postgres.Expression.RuntimeOf<typeof localTimestamp>
type NowRuntime = Postgres.Expression.RuntimeOf<typeof now>

type _AssertCurrentDate = Assert<IsExact<CurrentDateRuntime, Postgres.Expression.LocalDateString>>
type _AssertCurrentTime = Assert<IsExact<CurrentTimeRuntime, Postgres.Expression.OffsetTimeString>>
type _AssertCurrentTimestamp = Assert<IsExact<CurrentTimestampRuntime, Postgres.Expression.InstantString>>
type _AssertLocalTime = Assert<IsExact<LocalTimeRuntime, Postgres.Expression.LocalTimeString>>
type _AssertLocalTimestamp = Assert<IsExact<LocalTimestampRuntime, Postgres.Expression.LocalDateTimeString>>
type _AssertNow = Assert<IsExact<NowRuntime, Postgres.Expression.InstantString>>

void currentDate
void currentTime
void currentTimestamp
void localTime
void localTimestamp
void now
