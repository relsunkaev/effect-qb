import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

import { Column, Fragment, Function, Query, Table } from "#standard"
import { Executor as PgExecutor, Function as PgFunction, Renderer as PgRenderer } from "#postgres"
import { Renderer as MysqlRenderer } from "#mysql"
import { Function as SqliteFunction, Renderer as SqliteRenderer } from "#sqlite"

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
      adjusted: Function.abs(Function.negate(Function.add(users.score, 5))),
      scaled: Function.multiply(users.score, 2),
      difference: Function.subtract(users.score, 3),
      total: Function.sum(users.score),
      average: Function.avg(users.score)
    }).pipe(Query.from(users))

    expect(PgRenderer.make().render(plan)).toMatchObject({
      sql: 'select abs((-("users"."score" + cast($1 as int)))) as "adjusted", ("users"."score" * cast($2 as int)) as "scaled", ("users"."score" - cast($3 as int)) as "difference", sum("users"."score") as "total", avg("users"."score") as "average" from "users"',
      params: [5, 2, 3]
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
      "lag(`users`.`score`, 1, ?) over (partition by `users`.`email` order by `users`.`id` asc rows between unbounded preceding and current row)"
    )
    expect(SqliteRenderer.make().render(plan).sql).toContain(
      'last_value("users"."score") over (partition by "users"."email" order by "users"."id" asc rows between unbounded preceding and current row)'
    )
    expect(PgRenderer.make().render(plan).sql).toContain(
      'sum("users"."score") over (partition by "users"."email" order by "users"."id" asc rows between unbounded preceding and current row)'
    )

    const groupsFrame = {
      orderBy: [{ value: users.id, direction: "asc" as const }],
      frame: {
        unit: "groups" as const,
        start: "unboundedPreceding" as const,
        end: "currentRow" as const
      }
    }
    expect(PgRenderer.make().render(
      Query.select({
        total: PgFunction.over(Function.sum(users.score), groupsFrame)
      }).pipe(Query.from(users))
    ).sql).toContain("groups between unbounded preceding and current row")
    expect(SqliteRenderer.make().render(
      Query.select({
        total: SqliteFunction.over(Function.sum(users.score), groupsFrame)
      }).pipe(Query.from(users))
    ).sql).toContain("groups between unbounded preceding and current row")
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

    expect(Effect.runSync(prepared.execute.pipe(PgExecutor.exactlyOne))).toEqual({ id: 1 })
    expect(Effect.runSync(prepared.execute.pipe(PgExecutor.atMostOne))).toEqual(Option.some({ id: 1 }))
    expect(Effect.runSync(prepared.execute.pipe(PgExecutor.nonEmpty))).toEqual([{ id: 1 }])
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

    expect(Effect.runSync(Effect.result(
      executor.execute(plan).pipe(PgExecutor.atMostOne)
    ))).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "ResultCardinalityError",
        expected: "zeroOrOne",
        actual: 2
      }
    })
  })
})
