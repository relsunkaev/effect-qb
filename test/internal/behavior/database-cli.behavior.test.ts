import { expect, test } from "bun:test"
import { BunServices } from "@effect/platform-bun"
import { Command } from "effect/unstable/cli"
import * as Effect from "effect/Effect"
import type * as Cause from "effect/Cause"
import type * as Crypto from "effect/Crypto"
import * as Option from "effect/Option"
import * as Queue from "effect/Queue"
import * as Terminal from "effect/Terminal"
import * as TestConsole from "effect/testing/TestConsole"

import { root, push, pull, migrateGenerate, migrateDown, migrateRepair } from "../../../packages/database/src/commands.js"

const run = <A, E>(program: Effect.Effect<A, E, Command.Environment | Crypto.Crypto>) =>
  Effect.runPromise(program.pipe(Effect.provide(BunServices.layer), Effect.provide(TestConsole.layer)))

const checkDefaults = <Name extends string, Input, E, R>(command: Command.Command<Name, Input, {}, E, R>) => {
  test(`${command.name}: omitted boolean flags default to false`, async () => {
    let parsed: unknown
    const probe = Command.withHandler(command, (flags) => Effect.sync(() => { parsed = flags }))
    await run(Command.runWith(probe, { version: "test" })([]))
    expect(parsed).toMatchObject(command.name === "generate"
      ? { allowDestructive: false }
      : { dryRun: false })
    if (command.name === "push") expect(parsed).toMatchObject({ allowDestructive: false })
  })
}
checkDefaults(push)
checkDefaults(pull)
checkDefaults(migrateGenerate)
checkDefaults(migrateDown)
checkDefaults(migrateRepair)

test("push: explicit boolean values preserve destructive opt-in", async () => {
  let parsed: unknown
  const probe = Command.withHandler(push, (flags) => Effect.sync(() => { parsed = flags }))
  await run(Command.runWith(probe, { version: "test" })(["--dry-run", "--allow-destructive"]))
  expect(parsed).toMatchObject({ dryRun: true, allowDestructive: true })
  await run(Command.runWith(probe, { version: "test" })(["--no-dry-run", "--no-allow-destructive"]))
  expect(parsed).toMatchObject({ dryRun: false, allowDestructive: false })
})

// Each prompt receives only its own keystrokes; exhausted scripts fail instead of hanging.
const scriptedTerminal = (prompts: readonly (readonly string[])[]) => {
  let index = 0
  return Terminal.make({
    columns: Effect.succeed(100),
    rows: Effect.succeed(30),
    readLine: Effect.die("Unexpected line prompt"),
    display: () => Effect.void,
    readInput: Effect.gen(function*() {
      const keys = prompts[index++]
      if (keys === undefined) return yield* Effect.die("Unexpected wizard prompt")
      const queue = yield* Queue.unbounded<Terminal.UserInput, Cause.Done>()
      if (keys.length === 0) {
        yield* Queue.end(queue)
        return queue
      }
      yield* Queue.offerAll(queue, keys.map((name) => ({
        input: Option.some(name),
        key: { name, ctrl: false, meta: false, shift: false }
      })))
      return queue
    })
  })
}

const checkWizard = <Name extends string, Input, E, R>(command: Command.Command<Name, Input, {}, E, R>) => {
  test(`${command.name}: wizard preserves optional flag defaults`, async () => {
    const count = command.name === "pull" ? 3 : 4
    const args = await run(Command.wizard(command).pipe(
      Effect.provideService(Terminal.Terminal, scriptedTerminal(Array.from({ length: count }, () => ["return"])))
    ))
    expect(args).toEqual([command.name])
    let parsed: unknown
    await run(Command.runWith(Command.withHandler(command, (flags) => Effect.sync(() => { parsed = flags })), {
      version: "test"
    })(args.slice(1)))
    expect(parsed).toMatchObject(command.name === "generate" ? { allowDestructive: false } : { dryRun: false })
  })
}
checkWizard(push)
checkWizard(pull)
checkWizard(migrateGenerate)

test("wizard-generated dry-run flags keep destructive changes disabled", async () => {
  const args = await run(Command.wizard(push).pipe(
    Effect.provideService(Terminal.Terminal, scriptedTerminal([
      ["return"], ["return"], ["y"], ["y"], ["return"]
    ]))
  ))
  expect(args).toEqual(["push", "--dry-run", "true"])
  let parsed: unknown
  await run(Command.runWith(Command.withHandler(push, (flags) => Effect.sync(() => { parsed = flags })), {
    version: "test"
  })(args.slice(1)))
  expect(parsed).toMatchObject({ dryRun: true, allowDestructive: false })
})

test("root wizard can be declined or cancelled without running the database handler", async () => {
  // No config/database services are mocked: running the real handler would fail.
  await run(Command.runWith(root, { version: "test" })(["push", "--wizard"]).pipe(
    Effect.provideService(Terminal.Terminal, scriptedTerminal([
      ["return"], ["return"], ["return"], ["return"], ["right", "return"]
    ]))
  ))
  await run(Command.runWith(root, { version: "test" })(["pull", "--wizard"]).pipe(
    Effect.provideService(Terminal.Terminal, scriptedTerminal([[]]))
  ))
})

test("built Node CLI accepts omitted booleans and reaches config loading", async () => {
  const node = Bun.which("node")
  if (node === null) throw new Error("Node.js is required for the CLI smoke test")
  for (const command of [["push"], ["pull"], ["migrate", "generate"], ["migrate", "down"], ["migrate", "repair"]]) {
    const configPath = `/effect-qb-missing-config-${crypto.randomUUID()}.ts`
    const process = Bun.spawn([node, "packages/database/dist/cli.js", ...command, "--config", configPath], {
      stdout: "pipe", stderr: "pipe"
    })
    const [stdout, stderr, status] = await Promise.all([
      new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited
    ])
    expect(status).not.toBe(0)
    expect(stdout + stderr).toContain(configPath)
    expect(stdout + stderr).not.toContain("MissingOption")
  }
})
