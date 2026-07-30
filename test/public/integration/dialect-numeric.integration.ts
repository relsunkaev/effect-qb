import { expect, test } from "bun:test"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { Cast, Fragment, Query as Q, Type } from "#standard"
import * as My from "#mysql"
import * as Pg from "#postgres"
import * as Sq from "#sqlite"
import { runMysql, runPostgres } from "./helpers.ts"

const runSqlite = <A, E>(effect: Effect.Effect<A, E, never>) =>
  Effect.runPromise(Effect.provide(effect, SqliteClient.layer({
    filename: ":memory:",
    disableWAL: true
  })))

test("postgres executes its exact, approximate, and integer numeric contracts", async () => {
  const result = await runPostgres(Effect.gen(function*() {
    const executor = Pg.Executor.make()
    const integerFive = Cast.to(5, Pg.Type.int4())
    const integerTwo = Cast.to(2, Pg.Type.int4())
    const exactFivePointFive = Cast.to(5.5, Type.numeric())
    const exactTwo = Cast.to(2, Type.numeric())
    const values = yield* executor.execute(Q.select({
      integerModulo: Pg.Function.modulo(integerFive, integerTwo),
      fractionalModulo: Pg.Function.modulo(exactFivePointFive, exactTwo),
      negativeModulo: Pg.Function.modulo(Cast.to(-5, Pg.Type.int4()), integerTwo),
      exactTiePositive: Pg.Function.round(Cast.to(2.5, Type.numeric())),
      exactTieNegative: Pg.Function.round(Cast.to(-2.5, Type.numeric())),
      exactScale: Pg.Function.round(Cast.to(2.675, Type.numeric()), 2),
      approximateTie: Pg.Function.round(Cast.to(2.5, Pg.Type.float8())),
      scaledInteger: Pg.Function.round(Cast.to(125, Pg.Type.int4()), -1)
    })).pipe(Pg.Executor.exactlyOne)
    const zero = yield* Effect.result(executor.execute(Q.select({
      value: Pg.Function.modulo(integerFive, Cast.to(0, Pg.Type.int4()))
    })))
    return { values, zero }
  }))

  expect(result.values).toEqual({
    integerModulo: 1,
    fractionalModulo: "1.5",
    negativeModulo: -1,
    exactTiePositive: "3",
    exactTieNegative: "-3",
    exactScale: "2.68",
    approximateTie: 2,
    scaledInteger: "130"
  })
  expect(result.zero._tag).toBe("Failure")
})

test("mysql executes integer, decimal, and approximate numeric contracts", async () => {
  const result = await runMysql(Effect.gen(function*() {
    const executor = My.Executor.make()
    const integerFive = Cast.to(5, Type.int())
    const integerTwo = Cast.to(2, Type.int())
    const exactFivePointFive = Fragment.expression({
      dbType: Type.decimal(),
      schema: Schema.String,
      nullability: "never"
    })`5.5`
    const exactTwo = Fragment.expression({
      dbType: Type.decimal(),
      schema: Schema.String,
      nullability: "never"
    })`2.0`
    const exactTwoPointFive = Fragment.expression({
      dbType: Type.decimal(),
      schema: Schema.String,
      nullability: "never"
    })`2.5`
    const exactNegativeTwoPointFive = Fragment.expression({
      dbType: Type.decimal(),
      schema: Schema.String,
      nullability: "never"
    })`-2.5`
    const exactTwoPointSixSevenFive = Fragment.expression({
      dbType: Type.decimal(),
      schema: Schema.String,
      nullability: "never"
    })`2.675`
    const exactOneHundredTwentyThree = Fragment.expression({
      dbType: Type.decimal(),
      schema: Schema.String,
      nullability: "never"
    })`123.45`
    return yield* executor.execute(Q.select({
      integerModulo: My.Function.modulo(integerFive, integerTwo),
      fractionalModulo: My.Function.modulo(exactFivePointFive, exactTwo),
      approximateModulo: My.Function.modulo(
        Cast.to(5.5, My.Type.double()),
        Cast.to(2, My.Type.double())
      ),
      negativeModulo: My.Function.modulo(Cast.to(-5, Type.int()), integerTwo),
      zeroModulo: My.Function.modulo(integerFive, 0),
      exactTiePositive: My.Function.round(exactTwoPointFive),
      exactTieNegative: My.Function.round(exactNegativeTwoPointFive),
      exactScale: My.Function.round(exactTwoPointSixSevenFive, 2),
      approximateTie: My.Function.round(Cast.to(2.5, My.Type.double())),
      negativeScale: My.Function.round(exactOneHundredTwentyThree, -1)
    })).pipe(My.Executor.exactlyOne)
  }))

  expect(result).toEqual({
    integerModulo: "1",
    fractionalModulo: "1.5",
    approximateModulo: 1.5,
    negativeModulo: "-1",
    zeroModulo: null,
    exactTiePositive: "3",
    exactTieNegative: "-3",
    exactScale: "2.68",
    approximateTie: 2,
    negativeScale: "120"
  })
})

test("sqlite executes integer-coercing modulo and REAL rounding contracts", async () => {
  const result = await runSqlite(Effect.gen(function*() {
    const executor = Sq.Executor.make()
    return yield* executor.execute(Q.select({
      integerModulo: Sq.Function.modulo(
        Cast.to(5, Type.integer()),
        Cast.to(2, Type.integer())
      ),
      fractionalModulo: Sq.Function.modulo(
        Cast.to(5.5, Type.numeric()),
        Cast.to(2, Type.numeric())
      ),
      negativeModulo: Sq.Function.modulo(
        Cast.to(-5, Type.integer()),
        Cast.to(2, Type.integer())
      ),
      zeroModulo: Sq.Function.modulo(Cast.to(5, Type.integer()), 0),
      tiePositive: Sq.Function.round(Cast.to(2.5, Type.numeric())),
      tieNegative: Sq.Function.round(Cast.to(-2.5, Type.numeric())),
      floatingScale: Sq.Function.round(Cast.to(2.675, Type.numeric()), 2),
      negativeScale: Sq.Function.round(Cast.to(123.45, Type.numeric()), -1)
    })).pipe(Sq.Executor.exactlyOne)
  }))

  expect(result).toEqual({
    integerModulo: 1,
    fractionalModulo: 1,
    negativeModulo: -1,
    zeroModulo: null,
    tiePositive: 3,
    tieNegative: -3,
    floatingScale: 2.67,
    negativeScale: 123
  })
})
