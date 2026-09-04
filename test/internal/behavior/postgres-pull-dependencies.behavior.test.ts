import { expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { Column, Table } from "#standard"
import { toTableModel, type TableModel } from "effect-qb/postgres/metadata"
import { planPostgresPullEffect, summarizePullPlanEffect } from "../../../packages/database/src/postgres/pull.js"

const table = (name: string, dependencies: readonly string[] = [], composite = false): TableModel => ({
  ...toTableModel(Table.make(name, { id: Column.int(), peer: Column.int() })),
  options: dependencies.map((tableName) => ({
    kind: "foreignKey",
    columns: composite ? ["id", "peer"] : ["peer"],
    references: () => ({ tableName, columns: composite ? ["id", "peer"] : ["id"] })
  }))
})

const planFor = (tables: readonly TableModel[]) => Effect.runPromise(
  planPostgresPullEffect("/workspace", { include: ["src/**/*.ts"] }, {
    declarations: [], bindings: [], model: { dialect: "postgres", enums: [], tables: [] }
  }, { dialect: "postgres", enums: [], tables }).pipe(
    Effect.provide(FileSystem.layerNoop({ readFileString: () => Effect.succeed("") })),
    Effect.provide(Path.layer)
  )
)

const declarations = (source: string) => Array.from(source.matchAll(/(?:const|let) (\w+) = Table.make/g), (match) => match[1])

test("pull preserves dependency waves and source order within each wave", async () => {
  const plan = await planFor([
    table("last", ["early"]), table("early", ["root_b"]), table("later", ["root_a"]),
    table("root_a"), table("root_b"), table("independent")
  ])
  expect(declarations(plan.updates[0]!.after)).toEqual(["root_a", "root_b", "independent", "early", "later", "last"])
  expect(plan.warnings ?? []).toEqual([])
})

test("pull appends cycles and their blocked dependents in source order", async () => {
  const plan = await planFor([
    table("dependent", ["cycle_a"]), table("cycle_a", ["cycle_b"]), table("ready"),
    table("cycle_b", ["cycle_a"]), table("self", ["self"])
  ])
  const source = plan.updates[0]!.after
  expect(declarations(source)).toEqual(["ready", "self", "dependent", "cycle_a", "cycle_b"])
  // Cyclic inline references must be deferred until after all base declarations.
  expect(source).not.toContain("Column.foreignKey(() => cycle_b.id)")
  expect(source).not.toContain("Column.foreignKey(() => self.id)")
  expect(source).toContain("cycle_a = cycle_a.pipe(")
  expect(source).toContain("self = self.pipe(")
  expect(plan.warnings).toEqual([
    "foreign-key cycle: public.cycle_a(peer) -> public.cycle_b(id); public.cycle_b(peer) -> public.cycle_a(id)",
    "foreign-key cycle: public.self(peer) -> public.self(id)"
  ])
  const summary = Effect.runSync(summarizePullPlanEffect("/workspace", plan).pipe(Effect.provide(Path.layer)))
  expect(summary).toContain(`warning: ${plan.warnings![0]}`)
})

test("composite foreign keys constrain ordering but do not disable unrelated inline references", async () => {
  const plan = await planFor([
    table("child", ["parent"], true), table("parent"),
    table("composite_a", ["composite_b"], true), table("composite_b", ["composite_a"], true),
    table("inline", ["parent"])
  ])
  expect(declarations(plan.updates[0]!.after)).toEqual(["parent", "child", "inline", "composite_a", "composite_b"])
  expect(plan.updates[0]!.after).toContain("Column.foreignKey(() => parent.id)")
  expect(plan.warnings).toEqual([
    "foreign-key cycle: public.composite_a(id, peer) -> public.composite_b(id, peer); public.composite_b(id, peer) -> public.composite_a(id, peer)"
  ])
})

test("pull still rejects foreign keys with unavailable source targets", async () => {
  await expect(planFor([table("external", ["not_pulled"])])).rejects.toThrow("missing source table 'public.not_pulled'")
})

test("pull reports one exact witness per disjoint cyclic group", async () => {
  const plan = await planFor([
    table("a", ["b", "c"]), table("b", ["a"]), table("c", ["a"]),
    table("d", ["e"]), table("e", ["d"])
  ])
  expect(plan.warnings).toEqual([
    "foreign-key cycle: public.a(peer) -> public.b(id); public.b(peer) -> public.a(id)",
    "foreign-key cycle: public.d(peer) -> public.e(id); public.e(peer) -> public.d(id)"
  ])
})
