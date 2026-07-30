import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

import { Column, Fragment, Function, Query, Table, Type } from "#standard"
import { Executor as PgExecutor, Function as PgFunction, Renderer as PgRenderer } from "#postgres"
import { Function as MysqlFunction, Renderer as MysqlRenderer } from "#mysql"
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
      dbType: Type.text(),
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
      total: PgFunction.sum(users.score),
      average: PgFunction.avg(users.score)
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
    const portableSpec = {
      partitionBy: [users.email],
      orderBy: [{ value: users.id, direction: "asc" as const }]
    }
    const plan = Query.select({
      previous: Function.lag(users.score, { spec: portableSpec, offset: 1, default: 0 }),
      first: Function.firstValue(users.score, portableSpec),
      last: Function.lastValue(users.score, portableSpec)
    }).pipe(Query.from(users))

    expect(PgRenderer.make().render(plan).sql).toContain(
      'lag("users"."score", $1, $2) over (partition by "users"."email" order by "users"."id" asc)'
    )
    expect(MysqlRenderer.make().render(plan).sql).toContain(
      "lag(`users`.`score`, 1, ?) over (partition by `users`.`email` order by `users`.`id` asc)"
    )
    expect(SqliteRenderer.make().render(plan).sql).toContain(
      'last_value("users"."score") over (partition by "users"."email" order by "users"."id" asc)'
    )

    const spec = {
      ...portableSpec,
      frame: {
        unit: "rows" as const,
        start: "unboundedPreceding" as const,
        end: "currentRow" as const
      }
    }
    expect(PgRenderer.make().render(
      Query.select({
        first: PgFunction.firstValue(users.score, spec),
        runningTotal: PgFunction.over(PgFunction.sum(users.score), spec)
      }).pipe(Query.from(users))
    ).sql).toContain('first_value("users"."score") over')
    expect(MysqlRenderer.make().render(
      Query.select({
        first: MysqlFunction.firstValue(users.score, spec),
        runningTotal: MysqlFunction.over(MysqlFunction.sum(users.score), spec)
      }).pipe(Query.from(users))
    ).sql).toContain("first_value(`users`.`score`) over")
    expect(SqliteRenderer.make().render(
      Query.select({
        last: SqliteFunction.lastValue(users.score, spec),
        runningTotal: SqliteFunction.over(SqliteFunction.sum(users.score), spec)
      }).pipe(Query.from(users))
    ).sql).toContain('last_value("users"."score") over')

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
        total: PgFunction.over(PgFunction.sum(users.score), groupsFrame)
      }).pipe(Query.from(users))
    ).sql).toContain("groups between unbounded preceding and current row")
    expect(SqliteRenderer.make().render(
      Query.select({
        total: SqliteFunction.over(SqliteFunction.sum(users.score), groupsFrame)
      }).pipe(Query.from(users))
    ).sql).toContain("groups between unbounded preceding and current row")
  })

  test("portable window helpers reject explicit frames at runtime", () => {
    const spec = {
      orderBy: [{ value: users.id }],
      frame: {
        unit: "rows" as const,
        start: "unboundedPreceding" as const,
        end: "currentRow" as const
      }
    }

    expect(() => Function.firstValue(users.score, spec as never)).toThrow(
      "use a dialect Function helper"
    )
    expect(() => Function.lag(users.score, { spec: spec as never })).toThrow(
      "use a dialect Function helper"
    )
    expect(() => Function.over(Function.count(users.id), spec as never)).toThrow(
      "use a dialect Function.over helper"
    )
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
