import type { DatatypeModule } from "../../internal/datatypes/define.js"
import type * as Expression from "../../internal/expression.js"
import { postgresDatatypeFamilies, postgresDatatypeKinds } from "./spec.js"

const postgresDatatypeModule = {
  custom: (kind: string) => ({
    dialect: "postgres",
    kind
  }),
  boolean: () => ({
    dialect: "postgres",
    kind: "bool"
  })
} as Record<string, (...args: readonly any[]) => Expression.DbType.Base<"postgres", string>>

for (const kind of Object.keys(postgresDatatypeKinds)) {
  postgresDatatypeModule[kind] = () => ({
    dialect: "postgres",
    kind
  })
}

export const postgresDatatypes = {
  ...(postgresDatatypeModule as DatatypeModule<
    "postgres",
    typeof postgresDatatypeKinds,
    { readonly boolean: "bool" }
  >),
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
