import * as StdRoot from "effect-qb"
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

const currentDateGrouped = StdRoot.Query.select({
  today: currentDate,
  rowCount: StdRoot.Function.count(StdRoot.Query.literal(1))
}).pipe(
  StdRoot.Query.groupBy(currentDate)
)

type CurrentDateRuntime = StdRoot.Scalar.RuntimeOf<typeof currentDate>
type CurrentTimeRuntime = StdRoot.Scalar.RuntimeOf<typeof currentTime>
type CurrentTimestampRuntime = StdRoot.Scalar.RuntimeOf<typeof currentTimestamp>
type LocalTimeRuntime = StdRoot.Scalar.RuntimeOf<typeof localTime>
type LocalTimestampRuntime = StdRoot.Scalar.RuntimeOf<typeof localTimestamp>
type NowRuntime = StdRoot.Scalar.RuntimeOf<typeof now>

type _AssertCurrentDate = Assert<IsExact<CurrentDateRuntime, StdRoot.Scalar.LocalDateString>>
type _AssertCurrentTime = Assert<IsExact<CurrentTimeRuntime, StdRoot.Scalar.OffsetTimeString>>
type _AssertCurrentTimestamp = Assert<IsExact<CurrentTimestampRuntime, StdRoot.Scalar.InstantString>>
type _AssertLocalTime = Assert<IsExact<LocalTimeRuntime, StdRoot.Scalar.LocalTimeString>>
type _AssertLocalTimestamp = Assert<IsExact<LocalTimestampRuntime, StdRoot.Scalar.LocalDateTimeString>>
type _AssertNow = Assert<IsExact<NowRuntime, StdRoot.Scalar.InstantString>>

const completeCurrentDateGrouped: StdRoot.Query.CompletePlan<typeof currentDateGrouped> = currentDateGrouped

void currentDate
void currentTime
void currentTimestamp
void localTime
void localTimestamp
void now
void completeCurrentDateGrouped
