import { Cast, Column, Json, Query as Q, Scalar, Table } from "effect-qb"
import { Column as PgColumn, Jsonb, Type } from "effect-qb/postgres"
import * as Pg from "effect-qb/postgres"
import * as Schema from "effect/Schema"

type IsAny<Value> = 0 extends (1 & Value) ? true : false
type IsEqual<Left, Right> = (
  <Value>() => Value extends Left ? 1 : 2
) extends (
  <Value>() => Value extends Right ? 1 : 2
) ? true : false
type Expect<T extends true> = T
type IsExact<Actual, Expected> = IsAny<Actual> extends true ? false : IsEqual<Actual, Expected>

const payloadSchema = Schema.Struct({
  profile: Schema.Struct({
    address: Schema.Struct({
      city: Schema.String,
      postcode: Schema.NullOr(Schema.String)
    }),
    tags: Schema.Array(Schema.String),
    pair: Schema.Tuple(Schema.String, Schema.Number),
    metrics: Schema.Struct({
      count: Schema.Number,
      active: Schema.Boolean
    })
  }),
  note: Schema.NullOr(Schema.String)
})

const docs = Table.make("docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: Column.json(payloadSchema),
  payloadJsonb: PgColumn.jsonb(payloadSchema)
})

const profile = docs.payloadJsonb.profile
const city = docs.payloadJsonb.profile.address.city
const cityText = docs.payloadJsonb.profile.address.city.pipe(Jsonb.text)
const countText = docs.payloadJsonb.profile.metrics.count.pipe(Jsonb.text)
const count = Cast.to(countText, Type.float8())
// @ts-expect-error jsonb path values must be extracted as text before numeric casts
Cast.to(docs.payloadJsonb.profile.metrics.count, Type.float8())
const firstTag = docs.payloadJsonb.profile.tags[0]!
const pairHead = docs.payloadJsonb.profile.pair[0]!
const pairTail = docs.payloadJsonb.profile.pair[1]!
const sharedJsonCity = docs.payload.profile.address.city
const sharedJsonCityText = docs.payload.profile.address.city.pipe(Json.text)

type ProfileRuntime = Scalar.RuntimeOf<typeof profile>
type CityRuntime = Scalar.RuntimeOf<typeof city>
type CityTextRuntime = Scalar.RuntimeOf<typeof cityText>
type CountTextRuntime = Scalar.RuntimeOf<typeof countText>
type CountRuntime = Scalar.RuntimeOf<typeof count>
type FirstTagRuntime = Scalar.RuntimeOf<typeof firstTag>
type PairHeadRuntime = Scalar.RuntimeOf<typeof pairHead>
type PairTailRuntime = Scalar.RuntimeOf<typeof pairTail>
type SharedJsonCityRuntime = Scalar.RuntimeOf<typeof sharedJsonCity>
type SharedJsonCityTextRuntime = Scalar.RuntimeOf<typeof sharedJsonCityText>
type JsonbCityDb = Scalar.DbTypeOf<typeof city>
type SharedJsonCityDb = Scalar.DbTypeOf<typeof sharedJsonCity>

type _ProfileRuntime = Expect<IsExact<ProfileRuntime, {
  readonly address: {
    readonly city: string
    readonly postcode: string | null
  }
  readonly tags: readonly string[]
  readonly pair: readonly [string, number]
  readonly metrics: {
    readonly count: number
    readonly active: boolean
  }
}>>
type _CityRuntime = Expect<IsExact<CityRuntime, string>>
type _CityTextRuntime = Expect<IsExact<CityTextRuntime, string>>
type _CountTextRuntime = Expect<IsExact<CountTextRuntime, string>>
type _CountRuntime = Expect<IsExact<CountRuntime, number>>
type _FirstTagRuntime = Expect<IsExact<FirstTagRuntime, string | null>>
type _PairHeadRuntime = Expect<IsExact<PairHeadRuntime, string>>
type _PairTailRuntime = Expect<IsExact<PairTailRuntime, number>>
type _SharedJsonCityRuntime = Expect<IsExact<SharedJsonCityRuntime, string>>
type _SharedJsonCityTextRuntime = Expect<IsExact<SharedJsonCityTextRuntime, string>>
type _JsonbCityDb = Expect<JsonbCityDb extends Scalar.DbType.Json<"postgres", "jsonb"> ? true : false>
type _SharedJsonCityDb = Expect<SharedJsonCityDb extends Scalar.DbType.Json<"standard", "json"> ? true : false>

Jsonb.hasKey(docs.payloadJsonb.profile, "address")
docs.payloadJsonb.profile.pipe(Jsonb.hasKey("address"))
Jsonb.hasAnyKeys(docs.payloadJsonb.profile, "address", "tags")
Jsonb.hasAllKeys(docs.payloadJsonb.profile, "address", "tags")
docs.payloadJsonb.profile.address.city.pipe(Jsonb.pathExists)
Jsonb.pathExists(docs.payloadJsonb.profile.address.city)

const match = Jsonb.pathMatch(docs.payloadJsonb, '$.profile.metrics.count > 0')
const sharedMatch = Pg.Json.pathMatch(docs.payloadJsonb, '$.profile.metrics.count > 0')
type MatchRuntime = Scalar.RuntimeOf<typeof match>
type SharedMatchRuntime = Scalar.RuntimeOf<typeof sharedMatch>
type _MatchRuntime = Expect<IsExact<MatchRuntime, boolean | null>>
type _SharedMatchRuntime = Expect<IsExact<SharedMatchRuntime, boolean | null>>

const withoutNote = docs.payloadJsonb.note.pipe(Jsonb.delete)
const withoutPostcode = docs.payloadJsonb.profile.address.postcode.pipe(Jsonb.delete)

Q.update(docs, {
  // @ts-expect-error deleting a required top-level key no longer satisfies the payload schema
  payloadJsonb: withoutNote
})

Q.update(docs, {
  // @ts-expect-error deleting a required nested key no longer satisfies the payload schema
  payloadJsonb: withoutPostcode
})

// @ts-expect-error unknown exact object keys are not exposed by path access
docs.payloadJsonb.profile.missing

// @ts-expect-error `Jsonb.hasKey` only accepts known exact object keys for exact object schemas
Jsonb.hasKey(docs.payloadJsonb.profile, "missing")

// @ts-expect-error `Jsonb.hasAnyKeys` only accepts known exact object keys for exact object schemas
Jsonb.hasAnyKeys(docs.payloadJsonb.profile, "address", "missing")

const collisionDocs = Table.make("collision_docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: PgColumn.jsonb(Schema.Struct({
    pipe: Schema.String,
    "0": Schema.String,
    "legacy-name": Schema.String
  }))
})

const escapedPipe = collisionDocs.payload.pipe(Jsonb.key("pipe"), Jsonb.text)
const escapedNumericKey = collisionDocs.payload.pipe(Jsonb.key("0"), Jsonb.text)
const bracketedLegacyName = collisionDocs.payload["legacy-name"].pipe(Jsonb.text)

type EscapedPipeRuntime = Scalar.RuntimeOf<typeof escapedPipe>
type EscapedNumericKeyRuntime = Scalar.RuntimeOf<typeof escapedNumericKey>
type BracketedLegacyNameRuntime = Scalar.RuntimeOf<typeof bracketedLegacyName>

type _EscapedPipeRuntime = Expect<IsExact<EscapedPipeRuntime, string>>
type _EscapedNumericKeyRuntime = Expect<IsExact<EscapedNumericKeyRuntime, string>>
type _BracketedLegacyNameRuntime = Expect<IsExact<BracketedLegacyNameRuntime, string>>

// @ts-expect-error numeric object keys are intentionally not property accessors
collisionDocs.payload[0]

const optionalDocs = Table.make("optional_docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: PgColumn.jsonb(Schema.Struct({
    profile: Schema.optional(Schema.Struct({
      name: Schema.String,
      legacyName: Schema.optional(Schema.String),
      legacySlug: Schema.optional(Schema.String)
    }))
  }))
})

const optionalProfile = optionalDocs.payload.profile
const optionalProfileName = optionalDocs.payload.profile.pipe(Jsonb.key("name"))
const optionalProfileNameText = optionalDocs.payload.profile.pipe(Jsonb.key("name"), Jsonb.text)
const withoutOptionalLegacyFields = optionalDocs.payload.pipe(
  (payload) => payload.profile.legacyName.pipe(Jsonb.delete),
  (payload) => payload.profile.legacySlug.pipe(Jsonb.delete)
)

type OptionalProfileRuntime = Scalar.RuntimeOf<typeof optionalProfile>

type _OptionalProfileRuntime = Expect<IsExact<OptionalProfileRuntime, {
  readonly name: string
  readonly legacyName?: string | undefined
  readonly legacySlug?: string | undefined
} | null>>

Q.update(optionalDocs, {
  payload: withoutOptionalLegacyFields
})

const recordDocs = Table.make("record_docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: PgColumn.jsonb(Schema.Record({
    key: Schema.String,
    value: Schema.Struct({
      score: Schema.Number
    })
  }))
})

const recordScore = recordDocs.payload.anyKey!.score
Jsonb.hasKey(recordDocs.payload, "anyKey")

type RecordScoreRuntime = Scalar.RuntimeOf<typeof recordScore>
type _RecordScoreRuntime = Expect<IsExact<RecordScoreRuntime, number | null>>

const variantDocs = Table.make("variant_docs", {
  id: Column.uuid().pipe(Column.primaryKey),
  payload: PgColumn.jsonb(Schema.Union(
    Schema.Struct({
      kind: Schema.Literal("a"),
      aValue: Schema.String
    }),
    Schema.Struct({
      kind: Schema.Literal("b"),
      bValue: Schema.Number
    })
  ))
})

// @ts-expect-error variant-specific fields are rejected until narrowed or accessed via an explicit key escape hatch
variantDocs.payload.aValue
const variantKind = variantDocs.payload.kind.pipe(Jsonb.text)
const narrowedVariantPlan = Q.select({
  payload: variantDocs.payload,
  kind: variantKind
}).pipe(
  Q.from(variantDocs),
  Q.where(Q.eq(variantKind, "a"))
)

type NarrowedVariantRow = Q.ResultRow<typeof narrowedVariantPlan>

declare const narrowedVariantRow: NarrowedVariantRow
const narrowedPayloadKind: "a" = narrowedVariantRow.payload.kind
const narrowedSelectedKind: "a" = narrowedVariantRow.kind
// @ts-expect-error property-path discriminator equality removes the other branch
narrowedVariantRow.payload.bValue

const dynamicKey: string = "note"
const dynamicDelete = docs.payloadJsonb.pipe(Jsonb.key(dynamicKey), Jsonb.delete)

Q.update(docs, {
  // @ts-expect-error dynamic deletes are too broad for strongly typed JSON columns
  payloadJsonb: dynamicDelete
})

const citySetToNumber = docs.payloadJsonb.profile.address.city.pipe(Jsonb.set(123))

Q.update(docs, {
  // @ts-expect-error set result no longer satisfies the target JSON column schema
  payloadJsonb: citySetToNumber
})
