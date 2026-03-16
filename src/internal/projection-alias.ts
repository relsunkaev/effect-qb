/** Symbol used to attach explicit projection-alias metadata to an expression. */
export const TypeId: unique symbol = Symbol.for("effect-db/ProjectionAlias")

export type TypeId = typeof TypeId

/**
 * Projection-alias metadata carried by a runtime expression wrapper.
 *
 * This is intentionally orthogonal to the scalar expression AST. Aliasing does
 * not change SQL semantics; it only changes how a selected expression is named
 * in the rendered `SELECT ... AS ...` list.
 */
export interface State<Alias extends string = string> {
  readonly alias: Alias
}
