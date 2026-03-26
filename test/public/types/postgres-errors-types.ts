import * as Effect from "effect/Effect"

import * as Postgres from "effect-qb/postgres"

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

const executor = Postgres.Executor.make({ driver })
const execution = executor.execute(plan)

type Capabilities = Postgres.Query.CapabilitiesOfPlan<typeof plan>
const readCapability: Capabilities = "read"
type QueryError = Postgres.Executor.PostgresQueryError<typeof plan>
type ExecutionError = Effect.Effect.Error<typeof execution>

declare const executionError: ExecutionError
declare const queryError: QueryError
void readCapability
void queryError

class EmailAlreadyTaken extends Error {
  constructor(readonly details: {
    readonly constraint?: string
    readonly table?: string
  }) {
    super("Email already taken")
  }
}

const writeUsers = Postgres.Table.make("write_users", {
  id: Postgres.Column.text().pipe(Postgres.Column.primaryKey),
  email: Postgres.Column.text()
})

const writePlan = Postgres.Query.insert(writeUsers, {
  id: "user-1",
  email: "alice@example.com"
}).pipe(
  Postgres.Query.returning({
    id: writeUsers.id,
    email: writeUsers.email
  })
)

const writeDriver = Postgres.Executor.driver(() =>
  Effect.fail({
    code: "23505",
    message: "duplicate key value violates unique constraint",
    constraint: "write_users_email_key",
    table: "write_users"
  }))

const writeExecutor = Postgres.Executor.make({ driver: writeDriver })
const writeExecution = writeExecutor.execute(writePlan)

const recoveredWrite = writeExecution.pipe(
  Effect.catchTag("@postgres/integrity-constraint-violation/unique-violation", (error) => {
    const tag: "@postgres/integrity-constraint-violation/unique-violation" = error._tag
    const constraint: string | undefined = error.constraintName
    const table: string | undefined = error.tableName
    return Effect.fail(new EmailAlreadyTaken({ constraint, table }))
  })
)

const loggedWrite = writeExecution.pipe(
  Effect.tapErrorTag("@postgres/integrity-constraint-violation/unique-violation", (error) => {
    const sql: string | undefined = error.query?.sql
    const params: ReadonlyArray<unknown> | undefined = error.query?.params
    const raw = error.raw
    return Effect.succeed({ sql, params, raw })
  })
)

void recoveredWrite
void loggedWrite

const recovered = execution.pipe(
  Effect.catchTag("@postgres/unknown/query-requirements", (error) => {
    const tag: "@postgres/unknown/query-requirements" = error._tag
    const requiredCapabilities: readonly Postgres.Errors.PostgresQueryRequirement[] = error.requiredCapabilities
    const actualCapabilities: readonly string[] = error.actualCapabilities
    return Effect.succeed({ tag, requiredCapabilities, actualCapabilities })
  })
)

// @ts-expect-error unknown Postgres error tags should not be accepted by catchTag on this error channel
execution.pipe(Effect.catchTag("@postgres/not-real/tag", () => Effect.succeed(null)))

type RecoveredError = Effect.Effect.Error<typeof recovered>
declare const recoveredError: RecoveredError
// @ts-expect-error handled query-requirements should be removed from the error channel
const impossibleQueryRequirements: Extract<RecoveredError, { readonly _tag: "@postgres/unknown/query-requirements" }> = recoveredError

// @ts-expect-error write-only unique violations are removed from the read-query error channel
const impossibleUniqueViolation: Extract<
  ExecutionError,
  { readonly _tag: "@postgres/integrity-constraint-violation/unique-violation" }
> = executionError

if ("_tag" in executionError && executionError._tag === "@postgres/unknown/query-requirements") {
  const tag: "@postgres/unknown/query-requirements" = executionError._tag
  const requiredCapabilities: readonly Postgres.Errors.PostgresQueryRequirement[] = executionError.requiredCapabilities
  const actualCapabilities: readonly string[] = executionError.actualCapabilities
  void tag
  void requiredCapabilities
  void actualCapabilities
}
