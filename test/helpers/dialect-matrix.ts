import { Function, Query } from "#standard"

export const buildGroupedConcatPlan = (dialect: any, users: any, posts: any) => {
  const dialectFunction = dialect.Function
  const selected = Query.select({
    emailLabel: Function.concat(
      dialectFunction.lower(users.email),
      "-",
      Function.coalesce(Function.max(posts.title), "missing")
    ),
    firstTitle: Function.min(posts.title),
    postCount: Function.count(posts.id)
  })

  const fromUsers = Query.from(users)(selected)
  const joined = Query.innerJoin(posts, Query.eq(users.id, posts.userId))(fromUsers)
  const grouped = Query.groupBy(dialectFunction.lower(users.email))(joined)
  const filtered = Query.having(Query.eq(Function.count(posts.id), 2))(grouped)
  return Query.orderBy(Function.count(posts.id), "desc")(filtered)
}
