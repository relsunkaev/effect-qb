import * as Mysql from "#mysql"
import * as Postgres from "#postgres"
import * as Sqlite from "#sqlite"
import { Column as C, Table } from "#standard"
import * as StdRoot from "#standard"

export const makeRootSocialGraph = () => {
  const users = StdRoot.Table.make("users", {
    id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
    email: StdRoot.Column.text()
  })

  const posts = StdRoot.Table.make("posts", {
    id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
    userId: StdRoot.Column.uuid(),
    title: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
  })

  const comments = StdRoot.Table.make("comments", {
    id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
    postId: StdRoot.Column.uuid(),
    body: StdRoot.Column.text()
  })

  return {
    users,
    posts,
    comments
  }
}

export const makePostgresSocialGraph = () => {
  const users = StdRoot.Table.make("users", {
    id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
    email: StdRoot.Column.text()
  })

  const posts = StdRoot.Table.make("posts", {
    id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
    userId: StdRoot.Column.uuid(),
    title: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
  })

  const comments = StdRoot.Table.make("comments", {
    id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
    postId: StdRoot.Column.uuid(),
    body: StdRoot.Column.text()
  })

  return {
    users,
    posts,
    comments
  }
}

export const makeMysqlSocialGraph = () => {
  const users = StdRoot.Table.make("users", {
    id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
    email: StdRoot.Column.text()
  })

  const posts = StdRoot.Table.make("posts", {
    id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
    userId: StdRoot.Column.uuid(),
    title: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
  })

  const comments = StdRoot.Table.make("comments", {
    id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
    postId: StdRoot.Column.uuid(),
    body: StdRoot.Column.text()
  })

  return {
    users,
    posts,
    comments
  }
}

export const makeSqliteSocialGraph = () => {
  const users = StdRoot.Table.make("users", {
    id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
    email: StdRoot.Column.text()
  })

  const posts = StdRoot.Table.make("posts", {
    id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
    userId: StdRoot.Column.text(),
    title: StdRoot.Column.text().pipe(StdRoot.Column.nullable)
  })

  const comments = StdRoot.Table.make("comments", {
    id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
    postId: StdRoot.Column.text(),
    body: StdRoot.Column.text()
  })

  return {
    users,
    posts,
    comments
  }
}

export const makeRootEmployees = () =>
  StdRoot.Table.make("employees", {
    id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
    managerId: StdRoot.Column.uuid().pipe(StdRoot.Column.nullable),
    name: StdRoot.Column.text()
  })

export const makePostgresEmployees = () =>
  StdRoot.Table.make("employees", {
    id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
    managerId: StdRoot.Column.uuid().pipe(StdRoot.Column.nullable),
    name: StdRoot.Column.text()
  })

export const makeMysqlEmployees = () =>
  StdRoot.Table.make("employees", {
    id: StdRoot.Column.uuid().pipe(StdRoot.Column.primaryKey),
    managerId: StdRoot.Column.uuid().pipe(StdRoot.Column.nullable),
    name: StdRoot.Column.text()
  })

export const makeSqliteEmployees = () =>
  StdRoot.Table.make("employees", {
    id: StdRoot.Column.text().pipe(StdRoot.Column.primaryKey),
    managerId: StdRoot.Column.text().pipe(StdRoot.Column.nullable),
    name: StdRoot.Column.text()
  })
