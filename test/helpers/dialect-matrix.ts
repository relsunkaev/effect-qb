export const buildGroupedConcatPlan = <TableModule extends {
  Query: {
    select: typeof import("#postgres").Query.select
    from: typeof import("#postgres").Query.from
    innerJoin: typeof import("#postgres").Query.innerJoin
    groupBy: typeof import("#postgres").Query.groupBy
    having: typeof import("#postgres").Query.having
    orderBy: typeof import("#postgres").Query.orderBy
    lower: typeof import("#postgres").Query.lower
    concat: typeof import("#postgres").Query.concat
    coalesce: typeof import("#postgres").Query.coalesce
    max: typeof import("#postgres").Query.max
    count: typeof import("#postgres").Query.count
    eq: typeof import("#postgres").Query.eq
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
