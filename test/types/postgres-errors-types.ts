import * as Effect from "effect/Effect"

import * as Postgres from "../../src/postgres.ts"

const descriptor = Postgres.Errors.getPostgresErrorDescriptor("23505")
const descriptorCode: "23505" = descriptor.code
const descriptorTag: "@postgres/integrity-constraint-violation/unique-violation" = descriptor.tag
void descriptorCode
void descriptorTag

const normalized = Postgres.Errors.normalizePostgresDriverError({
  code: "23505",
  message: "duplicate key value violates unique constraint",
  constraint: "users_email_key"
})

if (Postgres.Errors.hasSqlState(normalized, "23505")) {
  const code: "23505" = normalized.code
  const tag: "@postgres/integrity-constraint-violation/unique-violation" = normalized._tag
  const constraint: string | undefined = normalized.constraintName
  void code
  void tag
  void constraint
}

const users = Postgres.Table.make("users", {
  id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey)
})

const plan = Postgres.Query.select({
  id: users.id
}).pipe(
  Postgres.Query.from(users)
)

const driver = Postgres.Executor.driver(() =>
  Effect.fail({
    code: "23505",
    message: "duplicate key value violates unique constraint"
  }))

const executor = Postgres.Executor.fromDriver(Postgres.Renderer.make(), driver)
const execution = executor.execute(plan)

type ExecutionError = Effect.Effect.Error<typeof execution>

declare const executionError: ExecutionError

const recovered = execution.pipe(
  Effect.catchTag("@postgres/integrity-constraint-violation/unique-violation", (error) => {
    const tag: "@postgres/integrity-constraint-violation/unique-violation" = error._tag
    const code: "23505" = error.code
    return Effect.succeed({ tag, code })
  })
)

// @ts-expect-error unknown Postgres error tags should not be accepted by catchTag on this error channel
execution.pipe(Effect.catchTag("@postgres/not-real/tag", () => Effect.succeed(null)))

type RecoveredError = Effect.Effect.Error<typeof recovered>
declare const recoveredError: RecoveredError
// @ts-expect-error handled unique-violation should be removed from the error channel
const impossibleUniqueViolation: Extract<RecoveredError, { readonly _tag: "@postgres/integrity-constraint-violation/unique-violation" }> = recoveredError

if ("_tag" in executionError && executionError._tag === "@postgres/integrity-constraint-violation/unique-violation") {
  const tag: "@postgres/integrity-constraint-violation/unique-violation" = executionError._tag
  const code: "23505" = executionError.code
  void tag
  void code
}
