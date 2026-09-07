import { expect, test } from "bun:test"
import { Cast, Column, Function as Fn, Query as Q, Renderer, Table, Type } from "#standard"
import * as Pg from "#postgres"
import * as My from "#mysql"
import * as Sq from "#sqlite"

const source = Table.make('render"Source', {
  id: Column.int(),
  label: Column.text().pipe(Column.nullable)
})
const rows = Table.alias(source, "entry")
const inner = Q.select({ id: source.id }).pipe(Q.from(source), Q.where(Q.eq(source.id, 3)))
const expressions = {
  column: rows.id,
  literal: Q.literal("literal"),
  nullLiteral: Q.literal(null),
  booleanLiteral: Q.literal(false),
  conjunction: Q.and(Q.gt(rows.id, 1), Q.lte(rows.id, 9)),
  disjunction: Q.or(Q.neq(rows.id, 2), Q.lt(rows.id, 1)),
  negation: Q.not(Q.eq(rows.id, 4)),
  nullable: Q.isNull(rows.label),
  nonNullable: Q.isNotNull(rows.label),
  concatenation: Fn.concat(rows.label, "-", "suffix"),
  coalescing: Fn.coalesce(rows.label, "missing"),
  caseBranch: Q.case().when(Q.gte(rows.id, 5), "high").else("low"),
  membership: Q.in(rows.id, 1, 3, 5),
  excludedMembership: Q.notIn(rows.id, 2, 4),
  interval: Q.between(rows.id, 1, 5),
  like: Q.like(rows.label, "%value%"),
  inSubquery: Q.inSubquery(rows.id, inner),
  scalarSubquery: Q.scalar(inner),
  exists: Q.exists(inner),
  castInComparison: Q.eq(Cast.to(rows.id, Type.text()), "7")
}

for (const [dialect, renderer] of Object.entries({
  standard: Renderer.make(), postgres: Pg.Renderer.make(),
  mysql: My.Renderer.make(), sqlite: Sq.Renderer.make()
})) {
  for (const [name, value] of Object.entries(expressions)) {
    test(`${dialect} expression ${name} preserves SQL and parameter order`, () => {
      const rendered = renderer.render(Q.select({ value }).pipe(Q.from(rows)))
      expect({ sql: rendered.sql, params: rendered.params }).toMatchSnapshot()
    })
  }
}
