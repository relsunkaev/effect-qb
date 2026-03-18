import { makeDatatypeModule } from "../../internal/datatypes/define.ts"
import { postgresDatatypeKinds } from "./spec.ts"

export const postgresDatatypes = makeDatatypeModule("postgres", postgresDatatypeKinds, {
  boolean: "bool"
})

export type PostgresDatatypeModule = typeof postgresDatatypes
