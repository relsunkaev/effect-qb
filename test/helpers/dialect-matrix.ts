export const buildGroupedConcatPlan = <TableModule extends {
  Query: {
    select: typeof import("../../src/index.ts").Query.select
    from: typeof import("../../src/index.ts").Query.from
    innerJoin: typeof import("../../src/index.ts").Query.innerJoin
    groupBy: typeof import("../../src/index.ts").Query.groupBy
    having: typeof import("../../src/index.ts").Query.having
    orderBy: typeof import("../../src/index.ts").Query.orderBy
    lower: typeof import("../../src/index.ts").Query.lower
    concat: typeof import("../../src/index.ts").Query.concat
    coalesce: typeof import("../../src/index.ts").Query.coalesce
    max: typeof import("../../src/index.ts").Query.max
    count: typeof import("../../src/index.ts").Query.count
    eq: typeof import("../../src/index.ts").Query.eq
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
