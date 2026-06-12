import type * as ExpressionAst from "../internal/expression-ast.js"
import type { CastTargetError } from "../internal/coercion/errors.js"
import type { RuntimeOfDbType } from "../internal/coercion/analysis.js"
import type { CanCastDbType } from "../internal/coercion/rules.js"
import type { FamilyOfDbType } from "../internal/datatypes/lookup.js"
import type { ExpressionInput } from "../internal/query.js"
import type * as Expression from "../internal/scalar.js"
import { cast as standardCast } from "../internal/standard-dsl.js"
import type { standardDatatypes } from "./datatypes/index.js"
import type { standardDatatypeFamilies } from "./datatypes/spec.js"

type CastInput = ExpressionInput
type CastTarget = Expression.DbType.Any
type IsAny<Value> = 0 extends (1 & Value) ? true : false

type StandardNullDb = Expression.DbType.Base<"standard", "null"> & {
  readonly family: "null"
  readonly runtime: "unknown"
  readonly compareGroup: "null"
  readonly castTargets: typeof standardDatatypeFamilies.null.castTargets
  readonly traits: {}
}

type LiteralDbType<Value> =
  Value extends string ? ReturnType<typeof standardDatatypes.text> :
    Value extends number ? ReturnType<typeof standardDatatypes.float8> :
      Value extends boolean ? ReturnType<typeof standardDatatypes.boolean> :
        Value extends Date ? ReturnType<typeof standardDatatypes.timestamp> :
          StandardNullDb

type CastSourceDbType<Value extends CastInput> = Value extends Expression.Any
  ? Expression.DbTypeOf<Value>
  : LiteralDbType<Value>

type CastDialect<Value extends CastInput, Target extends CastTarget> =
  CastSourceDbType<Value>["dialect"] | Target["dialect"]

type CastNullability<Value extends CastInput> = Value extends Expression.Any
  ? Expression.NullabilityOf<Value>
  : Value extends null ? "always" : "never"

type CastKind<Value extends CastInput> = Value extends Expression.Any
  ? Expression.KindOf<Value>
  : "scalar"

type CastDependencies<Value extends CastInput> = Value extends Expression.Any
  ? Expression.DependenciesOf<Value>
  : never

type JsonbScalarCastTarget<Value extends CastInput, Target extends CastTarget> =
  Value extends Expression.Any
    ? Expression.DbTypeOf<Value> extends Expression.DbType.Json<"postgres", "jsonb">
      ? [Expression.RuntimeOf<Value>] extends [number]
        ? FamilyOfDbType<Target> extends "numeric" ? Target : never
        : [Expression.RuntimeOf<Value>] extends [boolean]
          ? FamilyOfDbType<Target> extends "boolean" ? Target : never
          : never
      : never
    : never

type CanCastJsonbScalar<Value extends CastInput, Target extends CastTarget> =
  [JsonbScalarCastTarget<Value, Target>] extends [never]
    ? false
    : JsonbScalarCastTarget<Value, Target> extends Target
      ? true
      : false

type CastTargetInput<Value extends CastInput, Target extends CastTarget> =
  IsAny<Value> extends true
    ? Target
    : IsAny<Target> extends true
      ? Target
      : CanCastDbType<CastSourceDbType<Value>, Target, CastDialect<Value, Target>> extends true
        ? Target
        : CanCastJsonbScalar<Value, Target> extends true
          ? Target
        : CastTargetError<CastSourceDbType<Value>, Target, CastDialect<Value, Target>>

type CastValueInput<Value extends CastInput, Target extends CastTarget> =
  CastTargetInput<Value, Target> extends Target
    ? Value
    : CastTargetInput<Value, Target>

type CastExpression<
  Value extends CastInput,
  Target extends CastTarget
> = Expression.Scalar<
  RuntimeOfDbType<Target>,
  Target,
  CastNullability<Value>,
  CastDialect<Value, Target>,
  CastKind<Value>,
  CastDependencies<Value>
> & {
  readonly [ExpressionAst.TypeId]: ExpressionAst.CastNode<Value extends Expression.Any ? Value : Expression.Any, Target>
}

export const to: {
  <Value extends CastInput, Target extends CastTarget>(
    value: Value,
    target: Target & CastTargetInput<Value, Target>
  ): CastExpression<Value, Target>
  <Target extends CastTarget>(
    target: Target
  ): <Value extends CastInput>(value: Value & CastValueInput<Value, Target>) => CastExpression<Value, Target>
} = ((...args: [CastInput, CastTarget] | [CastTarget]) =>
  args.length === 1
    ? ((value: CastInput) => standardCast(value as never, args[0] as never))
    : standardCast(args[0] as never, args[1] as never)) as unknown as typeof to
