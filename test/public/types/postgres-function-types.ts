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

type CurrentDateRuntime = Postgres.Scalar.RuntimeOf<typeof currentDate>
type CurrentTimeRuntime = Postgres.Scalar.RuntimeOf<typeof currentTime>
type CurrentTimestampRuntime = Postgres.Scalar.RuntimeOf<typeof currentTimestamp>
type LocalTimeRuntime = Postgres.Scalar.RuntimeOf<typeof localTime>
type LocalTimestampRuntime = Postgres.Scalar.RuntimeOf<typeof localTimestamp>
type NowRuntime = Postgres.Scalar.RuntimeOf<typeof now>

type _AssertCurrentDate = Assert<IsExact<CurrentDateRuntime, Postgres.Scalar.LocalDateString>>
type _AssertCurrentTime = Assert<IsExact<CurrentTimeRuntime, Postgres.Scalar.OffsetTimeString>>
type _AssertCurrentTimestamp = Assert<IsExact<CurrentTimestampRuntime, Postgres.Scalar.InstantString>>
type _AssertLocalTime = Assert<IsExact<LocalTimeRuntime, Postgres.Scalar.LocalTimeString>>
type _AssertLocalTimestamp = Assert<IsExact<LocalTimestampRuntime, Postgres.Scalar.LocalDateTimeString>>
type _AssertNow = Assert<IsExact<NowRuntime, Postgres.Scalar.InstantString>>

void currentDate
void currentTime
void currentTimestamp
void localTime
void localTimestamp
void now
