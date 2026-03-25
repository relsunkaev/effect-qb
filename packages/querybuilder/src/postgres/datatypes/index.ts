import { makeDatatypeModule } from "../../internal/datatypes/define.js"
import { postgresDatatypeFamilies, postgresDatatypeKinds } from "./spec.js"

export const postgresDatatypes = makeDatatypeModule("postgres", postgresDatatypeKinds, {
  boolean: "bool"
})

export { postgresDatatypeFamilies, postgresDatatypeKinds }

export type PostgresDatatypeModule = typeof postgresDatatypes
