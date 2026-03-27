// @ts-nocheck
import { describe, expect, test } from "bun:test"

import { RowSet, Query as Q, Function as F, Table } from "#postgres"
import { Column as C } from "#postgres"
import { makeRootEmployees, makeRootSocialGraph } from "../../fixtures/schema.ts"
import { unsafeAny } from "../../helpers/unsafe.ts"

describe("query behavior", () => {
  test("literal-only selections stay complete and source-free", () => {
    const plan = Q.select({
      answer: Q.literal(42),
      ok: Q.and(true, Q.not(false)),
      label: F.concat("a", "b")
    }).pipe(
      Q.where(true)
    )

    expect(plan[RowSet.TypeId].required as unknown as readonly string[]).toEqual([])
    expect(plan[RowSet.TypeId].available).toEqual({})
  })

  test("required sources are de-duplicated and satisfied incrementally across joins", () => {
    const { users, posts, comments } = makeRootSocialGraph()

    const selected = Q.select({
      userId: users.id,
      postId: posts.id,
      commentId: comments.id,
      predicate: Q.and(Q.eq(users.email, "alice@example.com"), Q.isNull(posts.title))
    })

    expect(selected[RowSet.TypeId].required as unknown as readonly string[]).toEqual(["users", "posts", "comments"])

    const partiallySatisfied = selected.pipe(
      Q.from(users),
      Q.leftJoin(posts, Q.eq(users.id, posts.userId))
    )

    expect(partiallySatisfied[RowSet.TypeId].required as unknown as readonly string[]).toEqual(["comments"])
    expect(partiallySatisfied[RowSet.TypeId].available).toMatchObject({
      users: { name: "users", mode: "required", baseName: "users" },
      posts: { name: "posts", mode: "optional", baseName: "posts" }
    })
  })

  test("self-join aliases remain distinct through required and available source tracking", () => {
    const employees = makeRootEmployees()
    const manager = Table.alias(employees, "manager")
    const report = Table.alias(employees, "report")

    const selected = Q.select({
      managerId: manager.id,
      reportId: report.id
    })

    expect(selected[RowSet.TypeId].required as unknown as readonly string[]).toEqual(["manager", "report"])

    const sourced = selected.pipe(
      Q.from(manager),
      Q.leftJoin(report, Q.eq(report.managerId, manager.id))
    )

    expect(sourced[RowSet.TypeId].required as unknown as readonly string[]).toEqual([])
    expect(sourced[RowSet.TypeId].available).toMatchObject({
      manager: { name: "manager", mode: "required", baseName: "employees" },
      report: { name: "report", mode: "optional", baseName: "employees" }
    })
  })

  test("where and having contribute required sources until their referenced tables are in scope", () => {
    const { users, posts } = makeRootSocialGraph()

    const plan = Q.select({
      postCount: F.count(posts.id)
    }).pipe(
      Q.where(unsafeAny(Q.eq(users.email, "alice@example.com"))),
      Q.having(unsafeAny(Q.eq(unsafeAny(F.count(posts.id)), 2)))
    )

    expect(plan[RowSet.TypeId].required as unknown as readonly string[]).toEqual(["posts", "users"])

    const sourced = plan.pipe(
      Q.from(users),
      Q.innerJoin(posts, Q.eq(users.id, posts.userId))
    )

    expect(sourced[RowSet.TypeId].required as unknown as readonly string[]).toEqual([])
    expect(sourced[RowSet.TypeId].available).toMatchObject({
      users: { name: "users", mode: "required", baseName: "users" },
      posts: { name: "posts", mode: "required", baseName: "posts" }
    })
  })
})
