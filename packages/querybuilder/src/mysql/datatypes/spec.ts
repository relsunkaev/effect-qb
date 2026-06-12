import {
  mysqlDatatypeFamilies as matrixMysqlDatatypeFamilies,
  mysqlDatatypeKinds as matrixMysqlDatatypeKinds
} from "../../internal/datatypes/matrix.js"

export const mysqlDatatypeFamilies = matrixMysqlDatatypeFamilies
export const mysqlDatatypeKinds = matrixMysqlDatatypeKinds

export type MysqlDatatypeFamily = keyof typeof mysqlDatatypeFamilies
export type MysqlDatatypeKind = keyof typeof mysqlDatatypeKinds
