import * as Effect from "effect/Effect"

import * as Mysql from "../../src/mysql.ts"

const descriptor = Mysql.Errors.getMysqlErrorDescriptor("ER_DUP_ENTRY")
const descriptorSymbol: "ER_DUP_ENTRY" = descriptor.symbol
const descriptorNumber: Mysql.Errors.MysqlErrorNumber = descriptor.number
const descriptorTag: "@mysql/server/dup-entry" = descriptor.tag
void descriptorSymbol
void descriptorNumber
void descriptorTag

const normalized = Mysql.Errors.normalizeMysqlDriverError({
  code: "ER_DUP_ENTRY",
  errno: 1062,
  sqlState: "23000",
  sqlMessage: "Duplicate entry 'alice@example.com' for key 'users.email'"
})

if (Mysql.Errors.hasSymbol(normalized, "ER_DUP_ENTRY")) {
  const tag: "@mysql/server/dup-entry" = normalized._tag
  const symbol: "ER_DUP_ENTRY" = normalized.symbol
  const number: Mysql.Errors.MysqlErrorNumber = normalized.number
  void tag
  void symbol
  void number
}

if (Mysql.Errors.hasNumber(normalized, "1062")) {
  const number: "1062" = normalized.number
  void number
}

const users = Mysql.Table.make("users", {
  id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey)
})

const plan = Mysql.Query.select({
  id: users.id
}).pipe(
  Mysql.Query.from(users)
)

const driver = Mysql.Executor.driver(() =>
  Effect.fail({
    code: "ER_DUP_ENTRY",
    errno: 1062,
    sqlState: "23000",
    sqlMessage: "Duplicate entry '11111111-1111-1111-1111-111111111111' for key 'PRIMARY'"
  }))

const executor = Mysql.Executor.fromDriver(Mysql.Renderer.make(), driver)
const execution = executor.execute(plan)
type Capabilities = Mysql.Query.CapabilitiesOfPlan<typeof plan>
const readCapability: Capabilities = "read"
type QueryError = Mysql.Executor.MysqlQueryError<typeof plan>
type ExecutionError = Effect.Effect.Error<typeof execution>
declare const executionError: ExecutionError
declare const queryError: QueryError
void readCapability
void queryError

if ("_tag" in executionError && executionError._tag === "@mysql/unknown/query-requirements") {
  const tag: "@mysql/unknown/query-requirements" = executionError._tag
  const requiredCapabilities: readonly Mysql.Errors.MysqlQueryRequirement[] = executionError.requiredCapabilities
  const actualCapabilities: readonly string[] = executionError.actualCapabilities
  void tag
  void requiredCapabilities
  void actualCapabilities
}
