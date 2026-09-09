import { makeDatatypeModule, type DatatypeModule } from "../../internal/datatypes/define.js"
import type * as Expression from "../../internal/scalar.js"
import { postgresDatatypeFamilies, postgresDatatypeKinds } from "./spec.js"

const baseDatatypes = makeDatatypeModule("postgres", postgresDatatypeKinds, postgresDatatypeFamilies)

const postgresDatatypeModule = {
  ...baseDatatypes,
  boolean: () => baseDatatypes.bool()
} as Record<string, (...args: readonly any[]) => Expression.DbType.Base<"postgres", string>>

export const postgresDatatypes = {
  ...(postgresDatatypeModule as DatatypeModule<
    "postgres",
    typeof postgresDatatypeKinds,
    typeof postgresDatatypeFamilies,
    { readonly boolean: "bool" }
  >),
  json: (): Expression.DbType.Json<"postgres", "json"> => ({
    ...baseDatatypes.json(),
    variant: "json"
  }),
  jsonb: (): Expression.DbType.Json<"postgres", "jsonb"> => ({
    ...baseDatatypes.jsonb(),
    variant: "jsonb"
  })
}

export { postgresDatatypeFamilies, postgresDatatypeKinds }

export type PostgresDatatypeModule = typeof postgresDatatypes
