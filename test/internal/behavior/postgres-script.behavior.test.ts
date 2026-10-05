import { expect, test } from "bun:test"
import { postgresStatements } from "../../../packages/database/src/internal/postgres-script.js"

test("PostgreSQL parser preserves quoted semicolons, comments, and procedural bodies", async () => {
  const statements = [
    "SELECT 'é😀;''quoted', E'back\\\\slash;value'",
    "DO $body$ BEGIN RAISE NOTICE 'a;b'; END $body$",
    "CREATE FUNCTION f() RETURNS integer LANGUAGE SQL BEGIN ATOMIC SELECT 1; END",
    "SELECT 2 /* outer ; /* nested ; */ comment */"
  ]
  const parsed = await postgresStatements(`${statements.join(";\n")}; -- trailing ;`)
  expect(parsed.map((statement) => statement.trim())).toEqual(statements)
})

test("PostgreSQL parser uses UTF-8 offsets after non-ASCII comments and statements", async () => {
  expect((await postgresStatements("-- é😀;\nSELECT 'é😀';\nSELECT '終';")).map((statement) => statement.trim()))
    .toEqual(["SELECT 'é😀'", "SELECT '終'"])
})

test("empty and comment-only scripts contain no statements", async () => {
  expect(await postgresStatements(" \n; -- comment ;\n /* nested /* ; */ comment */")).toEqual([])
})

test("invalid and NUL-containing scripts reject instead of returning a partial script", async () => {
  await expect(postgresStatements("SELECT 1; definitely invalid SQL")).rejects.toThrow()
  await expect(postgresStatements("SELECT 1\0; SELECT 2")).rejects.toThrow("cannot contain NUL")
})
