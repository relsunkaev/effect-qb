import {
  portableDatatypeFamilies,
  portableDatatypeKinds,
  type PortableDatatypeFamily,
  type PortableDatatypeKind
} from "../../internal/datatypes/matrix.js"

export const standardDatatypeFamilies = portableDatatypeFamilies
export const standardDatatypeKinds = portableDatatypeKinds

export type StandardDatatypeFamily = PortableDatatypeFamily
export type StandardDatatypeKind = PortableDatatypeKind
