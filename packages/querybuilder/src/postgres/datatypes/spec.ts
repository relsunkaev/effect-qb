import {
  postgresDatatypeFamilies as matrixPostgresDatatypeFamilies,
  postgresDatatypeKinds as matrixPostgresDatatypeKinds
} from "../../internal/datatypes/matrix.js"

export const postgresDatatypeFamilies = matrixPostgresDatatypeFamilies
export const postgresDatatypeKinds = matrixPostgresDatatypeKinds

export type PostgresDatatypeFamily = keyof typeof postgresDatatypeFamilies
export type PostgresDatatypeKind = keyof typeof postgresDatatypeKinds
