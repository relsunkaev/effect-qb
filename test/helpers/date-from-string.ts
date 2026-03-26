import * as Schema from "effect/Schema"
import * as SchemaGetter from "effect/SchemaGetter"

export const DateFromStringSchema = Schema.String.pipe(
  Schema.decodeTo(Schema.DateValid, {
    decode: SchemaGetter.Date<string>(),
    encode: SchemaGetter.transform((date) => date.toISOString().slice(0, 10))
  })
)
