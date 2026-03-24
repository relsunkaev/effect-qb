export const buildGroupedConcatPlan = (table: any, users: any, posts: any) => {
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
