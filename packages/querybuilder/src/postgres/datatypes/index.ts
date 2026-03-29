import type { DatatypeModule } from "../../internal/datatypes/define.js"
import type * as Expression from "../../internal/scalar.js"
import { postgresDatatypeFamilies, postgresDatatypeKinds } from "./spec.js"

const withMetadata = <Kind extends keyof typeof postgresDatatypeKinds & string>(
  kind: Kind
): Expression.DbType.Base<"postgres", Kind> => {
  const kindSpec = postgresDatatypeKinds[kind]
  const familySpec = postgresDatatypeFamilies[kindSpec.family as keyof typeof postgresDatatypeFamilies]
  return {
    dialect: "postgres",
    kind,
    family: kindSpec.family,
    runtime: kindSpec.runtime,
    compareGroup: familySpec?.compareGroup,
    castTargets: familySpec?.castTargets,
    traits: familySpec?.traits
  }
}

const postgresDatatypeModule = {
  custom: (kind: string) => ({
    dialect: "postgres",
    kind
  }),
  boolean: () => withMetadata("bool")
} as Record<string, (...args: readonly any[]) => Expression.DbType.Base<"postgres", string>>

for (const kind of Object.keys(postgresDatatypeKinds)) {
  postgresDatatypeModule[kind] = () => withMetadata(kind as keyof typeof postgresDatatypeKinds & string)
}

export const postgresDatatypes = {
  ...(postgresDatatypeModule as DatatypeModule<
    "postgres",
    typeof postgresDatatypeKinds,
    typeof postgresDatatypeFamilies,
    { readonly boolean: "bool" }
  >),
  json: (): Expression.DbType.Json<"postgres", "json"> => ({
    ...withMetadata("json"),
    variant: "json"
  }),
  jsonb: (): Expression.DbType.Json<"postgres", "jsonb"> => ({
    ...withMetadata("jsonb"),
    variant: "jsonb"
  })
}

export { postgresDatatypeFamilies, postgresDatatypeKinds }

export type PostgresDatatypeModule = typeof postgresDatatypes
