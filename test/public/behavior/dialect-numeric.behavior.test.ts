import { describe, expect, test } from "bun:test"

import { Cast, Column, Query, Table, Type } from "#standard"
import * as My from "#mysql"
import * as Pg from "#postgres"
import * as Sq from "#sqlite"

const values = Table.make("numeric_values", {
  integer: Column.int(),
  exact: Column.number({ precision: 12, scale: 3 }),
  approximate: Column.real()
})

describe("dialect numeric functions", () => {
  test("renders PostgreSQL modulo and both round arities", () => {
    const exact = Cast.to(values.approximate, Type.numeric())
    const plan = Query.select({
      remainder: Pg.Function.modulo(values.integer, 2),
      roundedInteger: Pg.Function.round(values.integer),
      roundedApproximate: Pg.Function.round(values.approximate),
      roundedExact: Pg.Function.round(exact, 2),
      roundedScaledInteger: Pg.Function.round(values.integer, -1)
    }).pipe(Query.from(values))

    expect(Pg.Renderer.make().render(plan)).toMatchObject({
      sql: 'select ("numeric_values"."integer" % cast($1 as int4)) as "remainder", round("numeric_values"."integer") as "roundedInteger", round("numeric_values"."approximate") as "roundedApproximate", round(cast("numeric_values"."approximate" as numeric), $2) as "roundedExact", round("numeric_values"."integer", $3) as "roundedScaledInteger" from "numeric_values"',
      params: [2, 2, -1]
    })
  })

  test("rejects numeric literals that cannot satisfy the selected overload", () => {
    expect(() => Pg.Function.modulo(2_147_483_648, 2)).toThrow(
      "postgres modulo number literals must fit a signed int4"
    )
    expect(() => Sq.Function.round(values.integer, 0.5)).toThrow(
      "round scale must be a safe integer"
    )
  })

  test("renders MySQL integer, exact, and approximate numeric overloads", () => {
    const plan = Query.select({
      remainder: My.Function.modulo(values.integer, values.exact),
      roundedInteger: My.Function.round(values.integer),
      roundedExact: My.Function.round(values.exact, 2),
      roundedApproximate: My.Function.round(values.approximate, -1)
    }).pipe(Query.from(values))

    expect(My.Renderer.make().render(plan)).toMatchObject({
      sql: "select (`numeric_values`.`integer` % `numeric_values`.`exact`) as `remainder`, round(`numeric_values`.`integer`) as `roundedInteger`, round(`numeric_values`.`exact`, ?) as `roundedExact`, round(`numeric_values`.`approximate`, ?) as `roundedApproximate` from `numeric_values`",
      params: [2, -1]
    })
  })

  test("renders SQLite integer-coercing modulo and REAL round overloads", () => {
    const plan = Query.select({
      integerRemainder: Sq.Function.modulo(values.integer, values.integer),
      fractionalRemainder: Sq.Function.modulo(values.approximate, values.exact),
      rounded: Sq.Function.round(values.integer),
      roundedScaled: Sq.Function.round(values.exact, -1)
    }).pipe(Query.from(values))

    expect(Sq.Renderer.make().render(plan)).toMatchObject({
      sql: 'select ("numeric_values"."integer" % "numeric_values"."integer") as "integerRemainder", ("numeric_values"."approximate" % "numeric_values"."exact") as "fractionalRemainder", round("numeric_values"."integer") as "rounded", round("numeric_values"."exact", ?) as "roundedScaled" from "numeric_values"',
      params: [-1]
    })
  })
})
