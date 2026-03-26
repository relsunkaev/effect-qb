import { makeDatatypeModule } from "../../internal/datatypes/define.js"
import type * as Expression from "../../internal/expression.js"
import { postgresDatatypeFamilies, postgresDatatypeKinds } from "./spec.js"

const postgresDatatypeModule = makeDatatypeModule("postgres", postgresDatatypeKinds, {
  boolean: "bool"
})

export const postgresDatatypes = {
  ...postgresDatatypeModule,
  json: (): Expression.DbType.Json<"postgres", "json"> => ({
    dialect: "postgres",
    kind: "json",
    variant: "json"
  }),
  jsonb: (): Expression.DbType.Json<"postgres", "jsonb"> => ({
    dialect: "postgres",
    kind: "jsonb",
    variant: "jsonb"
  })
}

export { postgresDatatypeFamilies, postgresDatatypeKinds }

export type PostgresDatatypeModule = typeof postgresDatatypes
