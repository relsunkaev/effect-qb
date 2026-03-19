import * as Mysql from "../../src/mysql.ts"
import * as Postgres from "../../src/postgres.ts"
import { Column as C, Table } from "../../src/postgres.ts"

export const makeRootSocialGraph = () => {
  const users = Table.make("users", {
    id: C.uuid().pipe(C.primaryKey),
    email: C.text()
  })

  const posts = Table.make("posts", {
    id: C.uuid().pipe(C.primaryKey),
    userId: C.uuid(),
    title: C.text().pipe(C.nullable)
  })

  const comments = Table.make("comments", {
    id: C.uuid().pipe(C.primaryKey),
    postId: C.uuid(),
    body: C.text()
  })

  return {
    users,
    posts,
    comments
  }
}

export const makePostgresSocialGraph = () => {
  const users = Postgres.Table.make("users", {
    id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
    email: Postgres.Column.text()
  })

  const posts = Postgres.Table.make("posts", {
    id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
    userId: Postgres.Column.uuid(),
    title: Postgres.Column.text().pipe(Postgres.Column.nullable)
  })

  const comments = Postgres.Table.make("comments", {
    id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
    postId: Postgres.Column.uuid(),
    body: Postgres.Column.text()
  })

  return {
    users,
    posts,
    comments
  }
}

export const makeMysqlSocialGraph = () => {
  const users = Mysql.Table.make("users", {
    id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
    email: Mysql.Column.text()
  })

  const posts = Mysql.Table.make("posts", {
    id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
    userId: Mysql.Column.uuid(),
    title: Mysql.Column.text().pipe(Mysql.Column.nullable)
  })

  const comments = Mysql.Table.make("comments", {
    id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
    postId: Mysql.Column.uuid(),
    body: Mysql.Column.text()
  })

  return {
    users,
    posts,
    comments
  }
}

export const makeRootEmployees = () =>
  Table.make("employees", {
    id: C.uuid().pipe(C.primaryKey),
    managerId: C.uuid().pipe(C.nullable),
    name: C.text()
  })

export const makePostgresEmployees = () =>
  Postgres.Table.make("employees", {
    id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
    managerId: Postgres.Column.uuid().pipe(Postgres.Column.nullable),
    name: Postgres.Column.text()
  })

export const makeMysqlEmployees = () =>
  Mysql.Table.make("employees", {
    id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
    managerId: Mysql.Column.uuid().pipe(Mysql.Column.nullable),
    name: Mysql.Column.text()
  })
