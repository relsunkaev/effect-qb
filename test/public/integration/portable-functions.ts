import { Function as F, Query as Q } from "#standard"

export const portableScalarFunctions = Q.select({
  added: F.add(1, 2),
  subtracted: F.subtract(7, 2),
  multiplied: F.multiply(3, 4),
  negated: F.negate(5),
  absolute: F.abs(-9)
})

export const portableAggregateFunctions = Q.select({
  total: F.sum(F.add(2, 2)),
  average: F.avg(F.add(2, 2))
})

const windowValue = F.add(1, 1)
const windowOrder = F.add(0, 1)
const windowSpec = {
  orderBy: [{ value: windowOrder }],
  frame: {
    unit: "rows",
    start: "unboundedPreceding",
    end: "unboundedFollowing"
  }
} as const

export const portableWindowFunctions = Q.select({
  previous: F.lag(windowValue, {
    spec: { orderBy: windowSpec.orderBy },
    default: 0
  }),
  next: F.lead(windowValue, {
    spec: { orderBy: windowSpec.orderBy },
    default: 4
  }),
  first: F.firstValue(windowValue, windowSpec),
  last: F.lastValue(windowValue, windowSpec)
})

export const portableFunctionResults = {
  scalars: {
    added: 3,
    subtracted: 5,
    multiplied: 12,
    negated: -5,
    absolute: 9
  },
  aggregates: {
    total: 4,
    average: 4
  },
  windows: {
    previous: 0,
    next: 4,
    first: 2,
    last: 2
  }
} as const
