import type * as Expression from "../internal/scalar.js"
import { standardDatatypes } from "./datatypes/index.js"

const driverValueMapping = <Db extends Expression.DbType.Any>(
  dbType: Db,
  mapping: Expression.DriverValueMapping
): Db => ({
  ...dbType,
  driverValueMapping: mapping
})

/** Portable database-type constructors for casts and typed references. */
export const type = {
  ...standardDatatypes,
  driverValueMapping
}
