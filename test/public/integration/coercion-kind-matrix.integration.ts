import { expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import { postgresAdditionalCastTargets, postgresStringCastKinds, postgresDatatypeKinds } from "#internal/datatypes/matrix.ts"
import { runPostgres } from "./helpers.ts"

test("postgres 16 cast rules match native parsing for every modeled kind pair", async () => {
  const kinds = [...Object.keys(postgresAdditionalCastTargets), ...postgresStringCastKinds]
  expect([...kinds].sort()).toEqual(Object.keys(postgresDatatypeKinds).filter((kind) => kind !== "citext").sort())
  const rows = await runPostgres(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(Effect.gen(function*() {
      const [version] = yield* sql<{ version: string }>`select current_setting('server_version') as version`
      expect(version!.version).toMatch(/^16\./)
      yield* sql.unsafe(`
        create function pg_temp.effect_qb_can_cast(source_type text, target_type text)
        returns boolean language plpgsql as $$
        begin
          execute format('select null::%s::%s', source_type, target_type);
          return true;
        exception when cannot_coerce then return false;
        end $$`)
      return yield* sql.unsafe<{ source: string; target: string; accepted: boolean }>(
        `select s as source, t as target, pg_temp.effect_qb_can_cast(s, t) as accepted
         from unnest($1::text[]) s cross join unnest($1::text[]) t`, [kinds])
    }))
  }))
  const strings = new Set<string>(postgresStringCastKinds)
  const additional: Readonly<Record<string, readonly string[]>> = postgresAdditionalCastTargets
  expect(rows).toHaveLength(kinds.length ** 2)
  for (const { source, target, accepted } of rows) {
    const expected = source === target || strings.has(source) || strings.has(target) ||
      additional[source]?.includes(target) === true
    expect(accepted, `${source} -> ${target}`).toBe(expected)
  }
})

test("postgres structured casts keep array elements and enum identities separate", async () => {
  const { Cast, Query, Type } = await import("#standard")
  const Pg = await import("#postgres")
  await runPostgres(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql.withTransaction(Effect.gen(function*() {
      yield* sql.unsafe("create type effect_qb_cast_mood as enum ('ok')")
      yield* sql.unsafe("create type effect_qb_other_cast_mood as enum ('ok')")
      const row = yield* Pg.Executor.make().execute(Query.select({
        array: Cast.to(Cast.to("{1,2}", Pg.Type.array(Pg.Type.int4())), Pg.Type.array(Pg.Type.int8())),
        enumeration: Cast.to(Cast.to("ok", Pg.Type.enum("effect_qb_cast_mood")), Type.text())
      })).pipe(Pg.Executor.exactlyOne)
      expect(row).toEqual({ array: ["1", "2"], enumeration: "ok" })
      for (const query of [
        "select null::int4::int4[]",
        "select null::bool[]::numeric[]",
        "select null::int4[]::jsonb",
        "select null::effect_qb_cast_mood::int4",
        "select null::effect_qb_cast_mood::effect_qb_other_cast_mood"
      ]) {
        // Each expected failure needs its own savepoint, not an aborted transaction.
        const result = yield* Effect.result(sql.withTransaction(sql.unsafe(query)))
        expect(result._tag).toBe("Failure")
      }
      yield* sql.unsafe("drop type effect_qb_cast_mood")
      yield* sql.unsafe("drop type effect_qb_other_cast_mood")
    }))
  }))
})

test("postgres 16 comparison exclusions match native equality resolution", async () => {
  const { postgresAdditionalComparisonTargets, postgresNonComparableKinds } = await import("#internal/datatypes/matrix.ts")
  const kinds = [...Object.keys(postgresAdditionalCastTargets), ...postgresStringCastKinds]
  const rows = await runPostgres(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(Effect.gen(function*() {
      yield* sql.unsafe(`
        create function pg_temp.effect_qb_can_compare(source_type text, target_type text)
        returns boolean language plpgsql as $$
        begin
          execute format('select null::%s = null::%s', source_type, target_type);
          return true;
        exception when undefined_function or ambiguous_function then return false;
        end $$`)
      return yield* sql.unsafe<{ source: string; target: string; accepted: boolean }>(
        `select s as source, t as target, pg_temp.effect_qb_can_compare(s, t) as accepted
         from unnest($1::text[]) s cross join unnest($1::text[]) t`, [kinds])
    }))
  }))
  const excluded = new Set<string>(postgresNonComparableKinds)
  const additional: Readonly<Record<string, readonly string[]>> = postgresAdditionalComparisonTargets
  expect(rows).toHaveLength(kinds.length ** 2)
  for (const { source, target, accepted } of rows) {
    expect(accepted, `${source} = ${target}`).toBe(
      !excluded.has(source) && (source === target || additional[source]?.includes(target) === true))
  }
})

test("mysql 8.4 cast target exclusions match the production renderer", async () => {
  const { mysqlDatatypeKinds, mysqlUnsupportedCastKinds } = await import("#internal/datatypes/matrix.ts")
  const { mysqlDatatypes } = await import("../../../packages/querybuilder/src/mysql/datatypes/index.ts")
  const { Cast, Query } = await import("#standard")
  const My = await import("#mysql")
  const { runMysql } = await import("./helpers.ts")
  const excluded = new Set<string>(mysqlUnsupportedCastKinds)
  await runMysql(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const [version] = yield* sql<{ version: string }>`select version() as version`
    expect(version!.version).toMatch(/^8\.4\./)
    for (const kind of Object.keys(mysqlDatatypeKinds) as Array<keyof typeof mysqlDatatypeKinds>) {
      // Bypass static exclusions to prove that the database rejects their SQL.
      const plan = Query.select({ value: (Cast.to as any)(null, mysqlDatatypes[kind]()) })
      const rendered = My.Renderer.make().render(plan)
      const result = yield* Effect.result(sql.unsafe(rendered.sql, rendered.params))
      expect(result._tag, kind).toBe(excluded.has(kind) ? "Failure" : "Success")
    }
  }))
})
