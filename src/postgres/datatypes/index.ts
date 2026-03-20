import { makeDatatypeModule } from "../../internal/datatypes/define.js"
import { postgresDatatypeKinds } from "./spec.js"

export const postgresDatatypes = makeDatatypeModule("postgres", postgresDatatypeKinds, {
  boolean: "bool"
})

export type PostgresDatatypeModule = typeof postgresDatatypes
