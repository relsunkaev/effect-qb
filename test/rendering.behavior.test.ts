import { describe, expect, test } from "bun:test"

import * as Mysql from "../src/mysql.ts"
import { Query as Q, Renderer, Table } from "../src/index.ts"
import { Column as C } from "../src/index.ts"
import { makeMysqlEmployees, makeMysqlSocialGraph, makeRootSocialGraph } from "./fixtures/schema.ts"

describe("rendering behavior", () => {
  test("postgres renders clause combinations with stable parameter ordering", () => {
    const { users, posts } = makeRootSocialGraph()

    const plan = Q.select({
      label: Q.concat(Q.lower(users.email), "::"),
      fallbackTitle: Q.coalesce(posts.title, Q.literal("missing")),
      ok: Q.not(Q.or(Q.eq(users.email, "a"), Q.isNull(posts.title)))
    }).pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
      Q.where(Q.and(Q.eq(users.email, "alice@example.com"), Q.isNotNull(posts.title))),
      Q.orderBy(Q.lower(users.email), "desc")
    )

    const rendered = Renderer.make("postgres").render(plan)

    expect(rendered.sql).toBe('select (lower("users"."email") || $1) as "label", coalesce("posts"."title", $2) as "fallbackTitle", (not (("users"."email" = $3) or ("posts"."title" is null))) as "ok" from "users" left join "posts" on ("users"."id" = "posts"."userId") where (("users"."email" = $4) and ("posts"."title" is not null)) order by lower("users"."email") desc')
    expect(rendered.params).toEqual(["::", "missing", "a", "alice@example.com"])
    expect(rendered.projections).toEqual([
      { path: ["label"], alias: "label" },
      { path: ["fallbackTitle"], alias: "fallbackTitle" },
      { path: ["ok"], alias: "ok" }
    ])
  })

  test("mysql renders the same logical query with mysql-specific quoting and placeholders", () => {
    const { users, posts } = makeMysqlSocialGraph()

    const plan = Mysql.Query.select({
      label: Mysql.Query.concat(Mysql.Query.lower(users.email), "::"),
      fallbackTitle: Mysql.Query.coalesce(posts.title, Mysql.Query.literal("missing")),
      ok: Mysql.Query.not(Mysql.Query.or(Mysql.Query.eq(users.email, "a"), Mysql.Query.isNull(posts.title)))
    }).pipe(
      Mysql.Query.from(users),
      Mysql.Query.leftJoin(posts, Mysql.Query.eq(users.id, posts.userId)),
      Mysql.Query.where(Mysql.Query.and(Mysql.Query.eq(users.email, "alice@example.com"), Mysql.Query.isNotNull(posts.title))),
      Mysql.Query.orderBy(Mysql.Query.lower(users.email), "desc")
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe('select concat(lower(`users`.`email`), ?) as `label`, coalesce(`posts`.`title`, ?) as `fallbackTitle`, (not ((`users`.`email` = ?) or (`posts`.`title` is null))) as `ok` from `users` left join `posts` on (`users`.`id` = `posts`.`userId`) where ((`users`.`email` = ?) and (`posts`.`title` is not null)) order by lower(`users`.`email`) desc')
    expect(rendered.params).toEqual(["::", "missing", "a", "alice@example.com"])
    expect(rendered.projections).toEqual([
      { path: ["label"], alias: "label" },
      { path: ["fallbackTitle"], alias: "fallbackTitle" },
      { path: ["ok"], alias: "ok" }
    ])
  })

  test("renders literal-only selections without a from clause", () => {
    const plan = Q.select({
      answer: Q.literal(42),
      label: Q.literal("user")
    })

    const rendered = Renderer.make("postgres").render(plan)

    expect(rendered.sql).toBe('select $1 as "answer", $2 as "label"')
    expect(rendered.params).toEqual([42, "user"])
    expect(rendered.projections).toEqual([
      { path: ["answer"], alias: "answer" },
      { path: ["label"], alias: "label" }
    ])
  })

  test("keeps projection metadata deterministic across repeated renders", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })

    const plan = Q.select({
      profile: {
        id: users.id,
        lowerEmail: Q.as(Q.lower(users.email), "email_lower")
      },
      kind: Q.literal("user")
    }).pipe(
      Q.from(users)
    )

    const renderer = Renderer.make("postgres")
    const first = renderer.render(plan)
    const second = renderer.render(plan)

    expect(first.sql).toBe('select "users"."id" as "profile__id", lower("users"."email") as "email_lower", $1 as "kind" from "users"')
    expect(first.projections).toEqual([
      { path: ["profile", "id"], alias: "profile__id" },
      { path: ["profile", "lowerEmail"], alias: "email_lower" },
      { path: ["kind"], alias: "kind" }
    ])
    expect(second.sql).toBe(first.sql)
    expect(second.params).toEqual(first.params)
    expect(second.projections).toEqual(first.projections)
  })

  test("rejects explicit aliases that collide with auto-generated aliases", () => {
    const users = Table.make("users", {
      id: C.uuid().pipe(C.primaryKey),
      email: C.text()
    })

    const invalid = Q.select({
      profile: {
        id: users.id
      },
      email: Q.as(users.email, "profile__id")
    }).pipe(
      Q.from(users)
    )

    expect(() => Renderer.make("postgres").render(invalid)).toThrow("Duplicate projection alias: profile__id")
  })

  test("quotes aliased self-joins with logical alias names and physical base tables", () => {
    const employees = makeMysqlEmployees()
    const manager = Mysql.Table.alias(employees, "manager")
    const report = Mysql.Table.alias(employees, "report")

    const plan = Mysql.Query.select({
      managerId: manager.id,
      reportName: report.name
    }).pipe(
      Mysql.Query.from(manager),
      Mysql.Query.leftJoin(report, Mysql.Query.eq(report.managerId, manager.id))
    )

    const rendered = Mysql.Renderer.make().render(plan)

    expect(rendered.sql).toBe('select `manager`.`id` as `managerId`, `report`.`name` as `reportName` from `employees` as `manager` left join `employees` as `report` on (`report`.`managerId` = `manager`.`id`)')
    expect(rendered.params).toEqual([])
  })
})
