import { Query, RowSet } from "#standard"
import { getAst, makePlan, makeRuntimePlan, updatePlan } from "#internal/query/plan.js"
import type * as QueryAst from "#internal/query/ast.js"

const plan = Query.select({ answer: Query.literal(42) })
const construct = makeRuntimePlan
const state = plan[RowSet.TypeId]
const ast = getAst(plan)

construct(state, ast, { statement: "select", capabilities: "read", insertSource: "ready" })

const minimal = makePlan(state, { kind: "select", select: state.selection })
const complete: QueryAst.Ast<typeof state.selection, never, "select"> = getAst(minimal)
// @ts-expect-error construction still requires the statement kind
construct(state, { select: state.selection })
// @ts-expect-error construction still requires the selection
construct(state, { kind: "select" })
// @ts-expect-error optional clauses still require modeled expressions
construct(state, { kind: "select", select: state.selection, groupBy: ["answer"] })

// @ts-expect-error insert readiness is not an arbitrary string
construct(state, ast, { insertSource: "finished" })
// @ts-expect-error named metadata rejects misspelled fields
construct(state, ast, { statment: "select" })
// @ts-expect-error positional metadata is no longer accepted
construct(state, ast, undefined, "read", "select")
// @ts-expect-error source availability must use a modeled source mode
construct({ ...state, available: { users: { name: "users", mode: "unknown" } } }, ast)

updatePlan(plan, { ast: { select: { answer: Query.literal(43) } }, additionalRequired: [] })
// @ts-expect-error selection/grouping updates cannot silently change the source scope
updatePlan(plan, { ast: { from: undefined }, additionalRequired: [] })
