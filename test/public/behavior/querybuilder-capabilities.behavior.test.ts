import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

import { Column, Fragment, Function, Query, Table } from "#standard"
import { Executor as PgExecutor, Renderer as PgRenderer } from "#postgres"
import { Renderer as MysqlRenderer } from "#mysql"
import { Renderer as SqliteRenderer } from "#sqlite"

const users = Table.make("users", {
  id: Column.int().pipe(Column.primaryKey),
  score: Column.int(),
  email: Column.text()
})

describe("querybuilder capability extensions", () => {
  test("typed SQL templates retain bound values and quote identifier paths", () => {
    const fallback = Query.literal("missing")
    const normalizedEmail = Fragment.expression({
      dbType: Query.type.text(),
      schema: Schema.String,
      nullability: "never"
    })`coalesce(${users.email}, ${fallback}) || ${Fragment.identifier("app", "suffix")}`

    const rendered = PgRenderer.make().render(
      Query.select({ normalizedEmail }).pipe(Query.from(users))
    )

    expect(rendered.sql).toBe(
      'select coalesce("users"."email", $1) || "app"."suffix" as "normalizedEmail" from "users"'
    )
    expect(rendered.params).toEqual(["missing"])
  })

  test("arithmetic and numeric functions render through the shared AST", () => {
    const plan = Query.select({
      adjusted: Function.round(Function.divide(Function.add(users.score, 5), 2)),
      total: Function.sum(users.score),
      average: Function.avg(users.score)
    }).pipe(Query.from(users))

    expect(PgRenderer.make().render(plan)).toMatchObject({
      sql: 'select round((("users"."score" + $1) / $2)) as "adjusted", sum("users"."score") as "total", avg("users"."score") as "average" from "users"',
      params: [5, 2]
    })
  })

  test("runtime predicate and selection composition has stable empty identities", () => {
    expect(PgRenderer.make().render(
      Query.select({ id: users.id }).pipe(
        Query.from(users),
        Query.where(Query.andAll([]))
      )
    ).sql).toContain("where true")

    expect(PgRenderer.make().render(
      Query.select({ id: users.id }).pipe(
        Query.from(users),
        Query.where(Query.orAll([]))
      )
    ).sql).toContain("where false")

    const includeEmail = false as boolean
    const plan = Query.select({
      id: users.id,
      ...Query.includeIf(includeEmail, { email: users.email })
    }).pipe(
      Query.from(users),
      Query.when(includeEmail, Query.where(Query.eq(users.email, "a@example.com")))
    )
    expect(PgRenderer.make().render(plan).sql).toBe(
      'select "users"."id" as "id" from "users"'
    )
  })

  test("analytic value functions and frames render across dialects", () => {
    const spec = {
      partitionBy: [users.email],
      orderBy: [{ value: users.id, direction: "asc" as const }],
      frame: {
        unit: "rows" as const,
        start: "unboundedPreceding" as const,
        end: "currentRow" as const
      }
    }
    const plan = Query.select({
      previous: Function.lag(users.score, { spec, offset: 1, default: 0 }),
      first: Function.firstValue(users.score, spec),
      last: Function.lastValue(users.score, spec),
      runningTotal: Function.over(Function.sum(users.score), spec)
    }).pipe(Query.from(users))

    expect(PgRenderer.make().render(plan).sql).toContain(
      'lag("users"."score", $1, $2) over (partition by "users"."email" order by "users"."id" asc rows between unbounded preceding and current row)'
    )
    expect(MysqlRenderer.make().render(plan).sql).toContain(
      "lag(`users`.`score`, ?, ?) over (partition by `users`.`email` order by `users`.`id` asc rows between unbounded preceding and current row)"
    )
    expect(SqliteRenderer.make().render(plan).sql).toContain(
      'last_value("users"."score") over (partition by "users"."email" order by "users"."id" asc rows between unbounded preceding and current row)'
    )
    expect(PgRenderer.make().render(plan).sql).toContain(
      'sum("users"."score") over (partition by "users"."email" order by "users"."id" asc rows between unbounded preceding and current row)'
    )
  })

  test("keyset pagination emits lexicographic cursor predicates and stable ordering", () => {
    const plan = Query.select({ id: users.id, score: users.score }).pipe(
      Query.from(users),
      Query.keyset({
        by: [
          { expression: users.score, cursor: 50, direction: "desc" },
          { expression: users.id, cursor: 10, direction: "asc" }
        ],
        pageSize: 25
      })
    )

    expect(PgRenderer.make().render(plan)).toMatchObject({
      sql: 'select "users"."id" as "id", "users"."score" as "score" from "users" where ((("users"."score" < $1)) or (("users"."score" = $2) and ("users"."id" > $3))) order by "users"."score" desc, "users"."id" asc limit $4',
      params: [50, 50, 10, 25]
    })
  })

  test("executors expose exact cardinality, metadata, prepared reuse, and explain", () => {
    const plan = Query.select({ id: users.id }).pipe(Query.from(users))
    let renders = 0
    const baseRenderer = PgRenderer.make()
    const renderer = {
      ...baseRenderer,
      render(value: typeof plan) {
        renders++
        return baseRenderer.render(value)
      }
    }
    const seenSql: string[] = []
    const driver = PgExecutor.driver({
      execute: (query) => {
        seenSql.push(query.sql)
        return Effect.succeed([{ id: 1 }])
      },
      executeResult: () => Effect.succeed({
        rows: [{ id: 1 }],
        affectedRows: 1,
        insertId: 7
      }),
      stream: () => Stream.fromIterable([{ id: 1 }])
    })
    const executor = PgExecutor.make({ renderer: renderer as never, driver })
    const prepared = executor.prepare(plan)

    expect(Effect.runSync(prepared.executeExactlyOne)).toEqual({ id: 1 })
    expect(Effect.runSync(prepared.executeOption)).toEqual(Option.some({ id: 1 }))
    expect(Effect.runSync(prepared.executeNonEmpty)).toEqual([{ id: 1 }])
    expect(Effect.runSync(prepared.executeResult)).toEqual({
      rows: [{ id: 1 }],
      affectedRows: 1,
      insertId: 7
    })
    expect(renders).toBe(1)

    expect(Effect.runSync(executor.explain(plan, { format: "json" }))).toEqual([{ id: 1 }])
    expect(seenSql.at(-1)).toBe(
      'explain (format json) select "users"."id" as "id" from "users"'
    )
  })

  test("exact cardinality reports the observed row count", () => {
    const plan = Query.select({ id: users.id }).pipe(Query.from(users))
    const executor = PgExecutor.make({
      driver: PgExecutor.driver(() => Effect.succeed([{ id: 1 }, { id: 2 }]))
    })

    expect(Effect.runSync(Effect.result(executor.executeOption(plan)))).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "ResultCardinalityError",
        expected: "zeroOrOne",
        actual: 2
      }
    })
  })
})
