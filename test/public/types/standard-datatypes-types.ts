import { Query as Q, Table, Column as C, Scalar as E, Type } from "effect-qb"

const assets = Table.make("assets", {
  id: C.uuid().pipe(C.primaryKey),
  name: C.varchar(64),
  code: C.char(8),
  size: C.bigint(),
  ratio: C.real(),
  payload: C.blob()
})

const plan = Q.select({
  id: assets.id,
  name: assets.name,
  code: assets.code,
  size: assets.size,
  ratio: assets.ratio,
  payload: assets.payload
}).pipe(
  Q.from(assets)
)

type Row = Q.ResultRow<typeof plan>
const id: Row["id"] = "550e8400-e29b-41d4-a716-446655440000"
const name: Row["name"] = "asset"
const code: Row["code"] = "asset-01"
const size: Row["size"] = "1024" as E.BigIntString
const ratio: Row["ratio"] = 1.5
const payload: Row["payload"] = new Uint8Array()
void id
void name
void code
void size
void ratio
void payload

const blobValue = Q.cast("deadbeef", Type.blob())
const blobRuntime: E.RuntimeOf<typeof blobValue> = new Uint8Array()
void blobRuntime

// @ts-expect-error portable type witnesses moved to the root Type module
Q.type.text()

// @ts-expect-error float8 is postgres-specific
Type.float8()
// @ts-expect-error clob is not portable across supported dialect renderers
Type.clob()
// @ts-expect-error double is not portable across supported dialect renderers
Type.double()
// @ts-expect-error arrays are dialect-specific
Type.array(Type.text())
// @ts-expect-error enum types are dialect-specific
Type.enum("status")
// @ts-expect-error set types are dialect-specific
Type.set("set('admin')")

// @ts-expect-error custom db type names must be non-empty
Type.custom("")

// @ts-expect-error bigint columns expose canonical bigint strings, not numbers
const invalidSize: Row["size"] = 1024
void invalidSize
