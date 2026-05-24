import { Query as Q, Table, Column as C, Scalar as E } from "effect-qb/standard"

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

const blobValue = Q.cast("deadbeef", Q.type.blob())
const blobRuntime: E.RuntimeOf<typeof blobValue> = new Uint8Array()
void blobRuntime

// @ts-expect-error custom db type names must be non-empty
Q.type.custom("")

// @ts-expect-error bigint columns expose canonical bigint strings, not numbers
const invalidSize: Row["size"] = 1024
void invalidSize
