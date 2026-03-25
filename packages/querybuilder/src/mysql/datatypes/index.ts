import { makeDatatypeModule } from "../../internal/datatypes/define.js"
import { mysqlDatatypeKinds } from "./spec.js"

export const mysqlDatatypes = makeDatatypeModule("mysql", mysqlDatatypeKinds)

export type MysqlDatatypeModule = typeof mysqlDatatypes
