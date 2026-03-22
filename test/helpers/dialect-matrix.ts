export const buildGroupedConcatPlan = <TableModule extends {
  Query: {
    select: typeof import("#postgres").Query.select
    from: typeof import("#postgres").Query.from
    innerJoin: typeof import("#postgres").Query.innerJoin
    groupBy: typeof import("#postgres").Query.groupBy
    having: typeof import("#postgres").Query.having
    orderBy: typeof import("#postgres").Query.orderBy
    eq: typeof import("#postgres").Query.eq
  }
  Function: {
    lower: typeof import("#postgres").Function.lower
    concat: typeof import("#postgres").Function.concat
    coalesce: typeof import("#postgres").Function.coalesce
    max: typeof import("#postgres").Function.max
    min: typeof import("#postgres").Function.min
    count: typeof import("#postgres").Function.count
  }
}>(table: TableModule, users: any, posts: any) => {
  const selected = table.Query.select({
    emailLabel: table.Function.concat(
      table.Function.lower(users.email),
      "-",
      table.Function.coalesce(table.Function.max(posts.title), "missing")
    ),
    firstTitle: table.Function.min(posts.title),
    postCount: table.Function.count(posts.id)
  })

  const fromUsers = table.Query.from(users)(selected)
  const joined = table.Query.innerJoin(posts, table.Query.eq(users.id, posts.userId))(fromUsers)
  const grouped = table.Query.groupBy(table.Function.lower(users.email))(joined)
  const filtered = table.Query.having(table.Query.eq(table.Function.count(posts.id), 2))(grouped)
  return table.Query.orderBy(table.Function.count(posts.id), "desc")(filtered)
}
