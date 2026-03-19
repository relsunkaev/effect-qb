export const buildGroupedConcatPlan = <TableModule extends {
  Query: {
    select: typeof import("../../src/postgres.ts").Query.select
    from: typeof import("../../src/postgres.ts").Query.from
    innerJoin: typeof import("../../src/postgres.ts").Query.innerJoin
    groupBy: typeof import("../../src/postgres.ts").Query.groupBy
    having: typeof import("../../src/postgres.ts").Query.having
    orderBy: typeof import("../../src/postgres.ts").Query.orderBy
    lower: typeof import("../../src/postgres.ts").Query.lower
    concat: typeof import("../../src/postgres.ts").Query.concat
    coalesce: typeof import("../../src/postgres.ts").Query.coalesce
    max: typeof import("../../src/postgres.ts").Query.max
    count: typeof import("../../src/postgres.ts").Query.count
    eq: typeof import("../../src/postgres.ts").Query.eq
  }
}>(table: TableModule, users: any, posts: any) => {
  const selected = table.Query.select({
    emailLabel: table.Query.concat(
      table.Query.lower(users.email),
      "-",
      table.Query.coalesce(table.Query.max(posts.title), "missing")
    ),
    firstTitle: table.Query.min(posts.title),
    postCount: table.Query.count(posts.id)
  })

  const fromUsers = table.Query.from(users)(selected)
  const joined = table.Query.innerJoin(posts, table.Query.eq(users.id, posts.userId))(fromUsers)
  const grouped = table.Query.groupBy(table.Query.lower(users.email))(joined)
  const filtered = table.Query.having(table.Query.eq(table.Query.count(posts.id), 2))(grouped)
  return table.Query.orderBy(table.Query.count(posts.id), "desc")(filtered)
}
