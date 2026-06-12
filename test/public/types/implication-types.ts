import { Column as PgColumn } from "effect-qb/postgres"
import * as Std from "effect-qb"
import * as Schema from "effect/Schema"

import { Cast, Query as Q, Function as F } from "effect-qb"
import { Type } from "effect-qb/postgres"

const users = Std.Table.make("users", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  email: Std.Column.text()
})

const posts = Std.Table.make("posts", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  userId: Std.Column.uuid(),
  status: Std.Column.text(),
  title: Std.Column.text().pipe(Std.Column.nullable)
})

const articles = Std.Table.make("articles", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  status: PgColumn.custom(Schema.Literal("draft", "published", "archived"), Type.text()),
  previousStatus: PgColumn.custom(Schema.Literal("draft", "published", "archived"), Type.text())
})

const articleStatusText = Cast.to(articles.status, Type.text())

const dottedPredicateTable = Std.Table.make("a.b", {
  status: PgColumn.custom(Schema.Literal("left", "right"), Type.text())
})

const splitPredicateTable = Std.Table.make("a", {
  "b.status": PgColumn.custom(Schema.Literal("left", "right"), Type.text())
})

const nullFiltered = Q.select({
  title: posts.title,
  upperTitle: F.upper(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.isNull(posts.title))
)

type NullFilteredRow = Q.ResultRow<typeof nullFiltered>
type NullFilteredRuntimeRow = Q.RuntimeResultRow<typeof nullFiltered>
const nullFilteredTitle: NullFilteredRow["title"] = null
const nullFilteredUpperTitle: NullFilteredRow["upperTitle"] = null
// @ts-expect-error isNull should collapse the selected column to null
const badNullFilteredTitle: NullFilteredRow["title"] = "hello"
// @ts-expect-error derived expressions over an always-null source should also be null
const badNullFilteredUpperTitle: NullFilteredRow["upperTitle"] = "HELLO"
const runtimeNullFilteredTitle: NullFilteredRuntimeRow["title"] = "hello"
const runtimeNullFilteredNullTitle: NullFilteredRuntimeRow["title"] = null
void nullFilteredTitle
void nullFilteredUpperTitle
void badNullFilteredTitle
void badNullFilteredUpperTitle
void runtimeNullFilteredTitle
void runtimeNullFilteredNullTitle

const conservativeNotNull = Q.select({
  title: posts.title,
  upperTitle: F.upper(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.not(Q.isNull(posts.title)))
)

type ConservativeNotNullRow = Q.ResultRow<typeof conservativeNotNull>
const conservativeTitle: ConservativeNotNullRow["title"] = "hello"
// @ts-expect-error not(isNull(...)) should narrow the filtered column itself
const conservativeNullTitle: ConservativeNotNullRow["title"] = null
const conservativeUpperTitle: ConservativeNotNullRow["upperTitle"] = "HELLO"
// @ts-expect-error derived expressions should still narrow when the direct column refinement is recognized
const conservativeNullUpperTitle: ConservativeNotNullRow["upperTitle"] = null
void conservativeTitle
void conservativeNullTitle
void conservativeUpperTitle
void conservativeNullUpperTitle

const promotedJoin = Q.select({
  userId: users.id,
  postId: posts.id
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.where(Q.isNotNull(posts.id))
)

type PromotedJoinRow = Q.ResultRow<typeof promotedJoin>
type PromotedJoinRuntimeRow = Q.RuntimeResultRow<typeof promotedJoin>
const promotedUserId: PromotedJoinRow["userId"] = "user-id"
const promotedPostId: PromotedJoinRow["postId"] = "post-id"
// @ts-expect-error ResultRow should promote the joined source to non-null
const badPromotedPostId: PromotedJoinRow["postId"] = null
const runtimePromotedPostId: PromotedJoinRuntimeRow["postId"] = null
void promotedUserId
void promotedPostId
void badPromotedPostId
void runtimePromotedPostId

const promotedJoinNullableColumn = Q.select({
  userId: users.id,
  postTitle: posts.title
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.where(Q.isNotNull(posts.id))
)

type PromotedJoinNullableColumnRow = Q.ResultRow<typeof promotedJoinNullableColumn>
const promotedNullableUserId: PromotedJoinNullableColumnRow["userId"] = "user-id"
const promotedNullablePostTitle: PromotedJoinNullableColumnRow["postTitle"] = "hello"
const promotedNullableNullPostTitle: PromotedJoinNullableColumnRow["postTitle"] = null
void promotedNullableUserId
void promotedNullablePostTitle
void promotedNullableNullPostTitle

const promotedByEquality = Q.select({
  userId: users.id,
  postTitle: posts.title,
  upperPostTitle: F.upper(posts.title)
}).pipe(
  Q.from(users),
  Q.leftJoin(posts, Q.eq(users.id, posts.userId)),
  Q.where(Q.eq(posts.title, users.email))
)

type PromotedByEqualityRow = Q.ResultRow<typeof promotedByEquality>
const promotedByEqualityUserId: PromotedByEqualityRow["userId"] = "user-id"
const promotedByEqualityPostTitle: PromotedByEqualityRow["postTitle"] = "hello"
const promotedByEqualityUpperPostTitle: PromotedByEqualityRow["upperPostTitle"] = "HELLO"
void promotedByEqualityUserId
void promotedByEqualityPostTitle
void promotedByEqualityUpperPostTitle

const promotedByIn = Q.select({
  title: posts.title,
  upperTitle: F.upper(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.in(posts.title, "draft", "published"))
)

type PromotedByInRow = Q.ResultRow<typeof promotedByIn>
const promotedInTitle: PromotedByInRow["title"] = "draft"
const promotedInUpperTitle: PromotedByInRow["upperTitle"] = "DRAFT"
// @ts-expect-error IN over literals should imply the filtered column is non-null
const promotedInNullTitle: PromotedByInRow["title"] = null
// @ts-expect-error derived expressions should inherit the non-null proof from IN
const promotedInNullUpperTitle: PromotedByInRow["upperTitle"] = null
void promotedInTitle
void promotedInUpperTitle
void promotedInNullTitle
void promotedInNullUpperTitle

const promotedByNotIn = Q.select({
  title: posts.title,
  upperTitle: F.upper(posts.title)
}).pipe(
  Q.from(posts),
  Q.where(Q.notIn(posts.title, "archived", "deleted"))
)

type PromotedByNotInRow = Q.ResultRow<typeof promotedByNotIn>
const promotedNotInTitle: PromotedByNotInRow["title"] = "draft"
const promotedNotInUpperTitle: PromotedByNotInRow["upperTitle"] = "DRAFT"
// @ts-expect-error NOT IN over literal values should refine the filtered column to non-null
const promotedNotInNullTitle: PromotedByNotInRow["title"] = null
// @ts-expect-error derived expressions should inherit the non-null proof from NOT IN
const promotedNotInNullUpperTitle: PromotedByNotInRow["upperTitle"] = null
declare const promotedByNotInRow: PromotedByNotInRow
const promotedNotInShouldBeNonNull: string = promotedByNotInRow.title
const promotedNotInUpperShouldBeNonNull: string = promotedByNotInRow.upperTitle
void promotedNotInTitle
void promotedNotInUpperTitle
void promotedNotInNullTitle
void promotedNotInNullUpperTitle
void promotedNotInShouldBeNonNull
void promotedNotInUpperShouldBeNonNull

const narrowedByEq = Q.select({
  title: posts.title
}).pipe(
  Q.from(posts),
  Q.where(Q.eq(posts.title, "draft"))
)

const dottedPredicateCollision = Q.select({
  splitStatus: splitPredicateTable["b.status"]
}).pipe(
  Q.from(splitPredicateTable),
  Q.crossJoin(dottedPredicateTable),
  Q.where(Q.eq(dottedPredicateTable.status, "left"))
)

type NarrowedByEqRow = Q.ResultRow<typeof narrowedByEq>
type DottedPredicateCollisionRow = Q.ResultRow<typeof dottedPredicateCollision>
declare const narrowedByEqRow: NarrowedByEqRow
const narrowedEqTitle: "draft" = narrowedByEqRow.title
// @ts-expect-error equality should narrow selected scalar output to the literal
const badNarrowedEqTitle: NarrowedByEqRow["title"] = "published"
declare const dottedPredicateCollisionRow: DottedPredicateCollisionRow
const dottedPredicateSplitCanBeRight: DottedPredicateCollisionRow["splitStatus"] = "right"
// @ts-expect-error filtering table "a.b".status should not narrow table "a"."b.status"
const badDottedPredicateSplitNarrow: "left" = dottedPredicateCollisionRow.splitStatus
void narrowedEqTitle
void badNarrowedEqTitle
void dottedPredicateSplitCanBeRight
void badDottedPredicateSplitNarrow

const dottedSourcePromotionCollision = Q.select({
  userId: users.id,
  splitStatus: splitPredicateTable["b.status"],
  dottedStatus: dottedPredicateTable.status
}).pipe(
  Q.from(users),
  Q.leftJoin(splitPredicateTable, Q.eq(splitPredicateTable["b.status"], "right")),
  Q.leftJoin(dottedPredicateTable, Q.eq(dottedPredicateTable.status, "left")),
  Q.where(Q.isNotNull(dottedPredicateTable.status))
)

type DottedSourcePromotionCollisionRow = Q.ResultRow<typeof dottedSourcePromotionCollision>
const dottedPromotionSplitCanBeNull: DottedSourcePromotionCollisionRow["splitStatus"] = null
// @ts-expect-error filtering table "a.b" should not promote unrelated table "a"
const badDottedPromotionSplitRequired: Exclude<DottedSourcePromotionCollisionRow["splitStatus"], null> =
  dottedPromotionSplitCanBeNull
const dottedPromotionStatusIsRequired: Exclude<DottedSourcePromotionCollisionRow["dottedStatus"], null> = "left"
void dottedPromotionSplitCanBeNull
void badDottedPromotionSplitRequired
void dottedPromotionStatusIsRequired

const narrowedByOr = Q.select({
  title: posts.title
}).pipe(
  Q.from(posts),
  Q.where(Q.or(
    Q.eq(posts.title, "draft"),
    Q.eq(posts.title, "published")
  ))
)

type NarrowedByOrRow = Q.ResultRow<typeof narrowedByOr>
declare const narrowedByOrRow: NarrowedByOrRow
const narrowedOrTitle: "draft" | "published" = narrowedByOrRow.title
// @ts-expect-error OR equality should narrow selected scalar output like IN
const badNarrowedOrTitle: NarrowedByOrRow["title"] = "archived"
void narrowedOrTitle
void badNarrowedOrTitle

const finiteStatusByIn = Q.select({
  status: articles.status
}).pipe(
  Q.from(articles),
  Q.where(Q.in(articles.status, "draft", "published"))
)

type FiniteStatusByInRow = Q.ResultRow<typeof finiteStatusByIn>
declare const finiteStatusByInRow: FiniteStatusByInRow
const finiteInStatus: "draft" | "published" = finiteStatusByInRow.status
// @ts-expect-error IN should remove finite-union members outside the set
const badFiniteInStatus: FiniteStatusByInRow["status"] = "archived"
void finiteInStatus
void badFiniteInStatus

const finiteStatusByNeq = Q.select({
  status: articles.status
}).pipe(
  Q.from(articles),
  Q.where(Q.neq(articles.status, "draft"))
)

type FiniteStatusByNeqRow = Q.ResultRow<typeof finiteStatusByNeq>
declare const finiteStatusByNeqRow: FiniteStatusByNeqRow
const finiteNeqStatus: "published" | "archived" = finiteStatusByNeqRow.status
// @ts-expect-error NEQ should remove excluded finite-union members
const badFiniteNeqStatus: FiniteStatusByNeqRow["status"] = "draft"
void finiteNeqStatus
void badFiniteNeqStatus

const finiteStatusByNotIn = Q.select({
  status: articles.status
}).pipe(
  Q.from(articles),
  Q.where(Q.notIn(articles.status, "archived"))
)

type FiniteStatusByNotInRow = Q.ResultRow<typeof finiteStatusByNotIn>
declare const finiteStatusByNotInRow: FiniteStatusByNotInRow
const finiteNotInStatus: "draft" | "published" = finiteStatusByNotInRow.status
// @ts-expect-error NOT IN should remove excluded finite-union members
const badFiniteNotInStatus: FiniteStatusByNotInRow["status"] = "archived"
void finiteNotInStatus
void badFiniteNotInStatus

const propagatedLiteral = Q.select({
  status: articles.status,
  previousStatus: articles.previousStatus
}).pipe(
  Q.from(articles),
  Q.where(Q.and(
    Q.eq(articles.status, "draft"),
    Q.eq(articles.previousStatus, articles.status)
  ))
)

type PropagatedLiteralRow = Q.ResultRow<typeof propagatedLiteral>
declare const propagatedLiteralRow: PropagatedLiteralRow
const propagatedPreviousStatus: "draft" = propagatedLiteralRow.previousStatus
// @ts-expect-error column equality should propagate selected literal output
const badPropagatedPreviousStatus: PropagatedLiteralRow["previousStatus"] = "published"
void propagatedPreviousStatus
void badPropagatedPreviousStatus

const narrowedBySameTypeCast = Q.select({
  status: articles.status,
  statusText: articleStatusText
}).pipe(
  Q.from(articles),
  Q.where(Q.eq(articleStatusText, "draft"))
)

type NarrowedBySameTypeCastRow = Q.ResultRow<typeof narrowedBySameTypeCast>
declare const narrowedBySameTypeCastRow: NarrowedBySameTypeCastRow
const castNarrowedStatus: "draft" = narrowedBySameTypeCastRow.status
const castNarrowedStatusText: "draft" = narrowedBySameTypeCastRow.statusText
// @ts-expect-error same-type cast predicates should narrow through the underlying column key
const badCastNarrowedStatus: NarrowedBySameTypeCastRow["status"] = "published"
// @ts-expect-error selected same-type cast expression should narrow to the literal
const badCastNarrowedStatusText: NarrowedBySameTypeCastRow["statusText"] = "published"
void castNarrowedStatus
void castNarrowedStatusText
void badCastNarrowedStatus
void badCastNarrowedStatusText
