import {
  sqliteDatatypeFamilies as matrixSqliteDatatypeFamilies,
  sqliteDatatypeKinds as matrixSqliteDatatypeKinds
} from "../../internal/datatypes/matrix.js"

export const sqliteDatatypeFamilies = matrixSqliteDatatypeFamilies
export const sqliteDatatypeKinds = matrixSqliteDatatypeKinds

export type SqliteDatatypeFamily = keyof typeof sqliteDatatypeFamilies
export type SqliteDatatypeKind = keyof typeof sqliteDatatypeKinds
