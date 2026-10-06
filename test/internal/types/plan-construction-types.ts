import { Query, RowSet } from "#standard"
import { getAst, makePlan, updatePlan, type RuntimePlanConstructor } from "#internal/query/plan.js"

const plan = Query.select({ answer: Query.literal(42) })
const construct: RuntimePlanConstructor = makePlan
const state = plan[RowSet.TypeId]
const ast = getAst(plan)

construct(state, ast, { statement: "select", capabilities: "read", insertSource: "ready" })

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
