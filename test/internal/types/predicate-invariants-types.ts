import { Column as PgColumn } from "effect-qb/postgres"
import * as Std from "effect-qb"
import * as Schema from "effect/Schema"

import { Function as F, Query as Q, Type } from "effect-qb/postgres"
import type { EmptyFacts, FactsOfFormula, GuaranteedLiteralSetInFacts, GuaranteedNeqLiteralInFacts } from "#internal/predicate/analysis.js"
import type { TrueFormula } from "#internal/predicate/formula.js"
import type { PredicateKeyOfExpression } from "#internal/predicate/key.js"
import type { FormulaOfPredicate } from "#internal/predicate/normalize.js"
import type { RuntimeOf } from "#internal/scalar.js"
import type { AssumptionsOfPlan, AvailableOfPlan, ExpressionOutput, FactsOfPlan, OutputOfSelection, SelectionOfPlan } from "#internal/query.js"

const posts = Std.Table.make("predicate_invariant_posts", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  title: Std.Column.text().pipe(Std.Column.nullable),
  status: PgColumn.custom(Schema.Literal("draft", "published", "archived"), Type.text()),
  category: PgColumn.custom(Schema.Literal("news", "ops", "meta"), Type.text())
})

type BaseStatusRuntime = RuntimeOf<typeof posts.status>
type StatusPredicateKey = PredicateKeyOfExpression<typeof posts.status>
const baseStatusRuntime: BaseStatusRuntime = "archived"
const statusPredicateKey: StatusPredicateKey = "predicate_invariant_posts.status"
// @ts-expect-error status column should have one exact predicate key
const badStatusPredicateKey: StatusPredicateKey = "predicate_invariant_posts.category"
void baseStatusRuntime
void statusPredicateKey
void badStatusPredicateKey

const basePlan = Q.select({
  status: posts.status,
  category: posts.category
}).pipe(
  Q.from(posts)
)

type BaseRow = Q.ResultRow<typeof basePlan>
const baseStatus: BaseRow["status"] = "archived"
const baseCategory: BaseRow["category"] = "ops"
void baseStatus
void baseCategory

const directLiteralPlan = Q.select({
  title: posts.title,
  upperTitle: F.upper(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.eq(posts.title, "draft"))
)

type DirectLiteralRow = Q.ResultRow<typeof directLiteralPlan>
type DirectLiteralRuntimeRow = Q.RuntimeResultRow<typeof directLiteralPlan>

declare const directLiteralRow: DirectLiteralRow
const directTitle: "draft" = directLiteralRow.title
const transformedTitle: string = directLiteralRow.upperTitle
// @ts-expect-error literal facts for title must not be applied to upper(title)
const badTransformedTitle: "draft" = directLiteralRow.upperTitle
// @ts-expect-error direct equality should remove other scalar literal values
const badDirectTitle: DirectLiteralRow["title"] = "published"
const runtimeTitle: DirectLiteralRuntimeRow["title"] = null
const runtimeTitleString: DirectLiteralRuntimeRow["title"] = "outside"
void directTitle
void transformedTitle
void badTransformedTitle
void badDirectTitle
void runtimeTitle
void runtimeTitleString

const mixedOrPredicate = Q.or(
  Q.eq(posts.status, "draft"),
  Q.eq(posts.category, "news")
)

type MixedOrFacts = FactsOfFormula<FormulaOfPredicate<typeof mixedOrPredicate>>
// @ts-expect-error mixed-key OR must not record branch-local status literals as guaranteed
const badMixedOrStatusFact: GuaranteedLiteralSetInFacts<MixedOrFacts, "predicate_invariant_posts.status"> = "string:draft"
// @ts-expect-error mixed-key OR must not record branch-local category literals as guaranteed
const badMixedOrCategoryFact: GuaranteedLiteralSetInFacts<MixedOrFacts, "predicate_invariant_posts.category"> = "string:news"
void badMixedOrStatusFact
void badMixedOrCategoryFact

const mixedOrPlan = Q.select({
  status: posts.status,
  category: posts.category
}).pipe(
  Q.from(posts),
  Q.where(mixedOrPredicate)
)

type MixedOrRow = Q.ResultRow<typeof mixedOrPlan>
type MixedOrPlanFacts = FactsOfPlan<typeof mixedOrPlan>
type MixedStatusKey = PredicateKeyOfExpression<typeof posts.status>
declare const mixedOrPlanStatusFact: GuaranteedLiteralSetInFacts<MixedOrPlanFacts, "predicate_invariant_posts.status">
const mixedOrPlanStatusFactMustBeNever: never = mixedOrPlanStatusFact
declare const mixedOrPlanStatusExclusionFact: GuaranteedNeqLiteralInFacts<MixedOrPlanFacts, "predicate_invariant_posts.status">
const mixedOrPlanStatusExclusionFactMustBeNever: never = mixedOrPlanStatusExclusionFact
type MixedOrStatusOutput = ExpressionOutput<
  typeof posts.status,
  AvailableOfPlan<typeof mixedOrPlan>,
  AssumptionsOfPlan<typeof mixedOrPlan>,
  MixedOrPlanFacts
>
type MixedOrStatusOutputEmptyFacts = ExpressionOutput<
  typeof posts.status,
  AvailableOfPlan<typeof mixedOrPlan>,
  AssumptionsOfPlan<typeof mixedOrPlan>,
  EmptyFacts
>
type MixedOrStatusOutputTrue = ExpressionOutput<
  typeof posts.status,
  AvailableOfPlan<typeof mixedOrPlan>,
  TrueFormula,
  EmptyFacts
>
type MixedOrSelectionOutput = OutputOfSelection<
  SelectionOfPlan<typeof mixedOrPlan>,
  AvailableOfPlan<typeof mixedOrPlan>,
  AssumptionsOfPlan<typeof mixedOrPlan>,
  MixedOrPlanFacts
>
// @ts-expect-error where(...) must preserve the mixed-key OR fact intersection
const badMixedOrPlanStatusFact: GuaranteedLiteralSetInFacts<MixedOrPlanFacts, "predicate_invariant_posts.status"> = "string:draft"
// @ts-expect-error selected status key must not see a mixed-key OR branch fact
const badMixedOrPlanStatusFactViaKey: GuaranteedLiteralSetInFacts<MixedOrPlanFacts, MixedStatusKey> = "string:draft"
// @ts-expect-error where(...) must preserve the mixed-key OR fact intersection
const badMixedOrPlanCategoryFact: GuaranteedLiteralSetInFacts<MixedOrPlanFacts, "predicate_invariant_posts.category"> = "string:news"
const mixedOrStatusOutput: MixedOrStatusOutput = "archived"
const mixedOrStatusOutputEmptyFacts: MixedOrStatusOutputEmptyFacts = "archived"
const mixedOrStatusOutputTrue: MixedOrStatusOutputTrue = "archived"
const mixedOrSelectionStatus: MixedOrSelectionOutput["status"] = "archived"
const mixedOrStatus: MixedOrRow["status"] = "archived"
const mixedOrCategory: MixedOrRow["category"] = "ops"
void badMixedOrPlanStatusFact
void badMixedOrPlanStatusFactViaKey
void badMixedOrPlanCategoryFact
void mixedOrPlanStatusFactMustBeNever
void mixedOrPlanStatusExclusionFactMustBeNever
void mixedOrStatusOutput
void mixedOrStatusOutputEmptyFacts
void mixedOrStatusOutputTrue
void mixedOrSelectionStatus
void mixedOrStatus
void mixedOrCategory

const wideInPlan = Q.select({
  title: posts.title
}).pipe(
  Q.from(posts),
  Q.where(Q.in(
    posts.title,
    "v00",
    "v01",
    "v02",
    "v03",
    "v04",
    "v05",
    "v06",
    "v07",
    "v08",
    "v09",
    "v10",
    "v11",
    "v12",
    "v13",
    "v14",
    "v15",
    "v16",
    "v17",
    "v18",
    "v19",
    "v20"
  ))
)

type WideInRow = Q.ResultRow<typeof wideInPlan>
declare const wideInRow: WideInRow
const wideInTitle: string = wideInRow.title
const outsideWideInTitle: WideInRow["title"] = "outside"
// @ts-expect-error capped IN should keep the safe SQL non-null fact
const badWideInNullTitle: WideInRow["title"] = null
void wideInTitle
void outsideWideInTitle
void badWideInNullTitle
