import { makeDatatypeModule } from "../../internal/datatypes/define.ts"
import { mysqlDatatypeKinds } from "./spec.ts"

export const mysqlDatatypes = makeDatatypeModule("mysql", mysqlDatatypeKinds)

export type MysqlDatatypeModule = typeof mysqlDatatypes
