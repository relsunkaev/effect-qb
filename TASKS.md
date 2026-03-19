# Query Builder Gaps

## Select

- [x] `UNION ALL`
- [x] `INTERSECT ALL`
- [x] `EXCEPT ALL`
- [x] standalone `VALUES(...)` sources
- [x] standalone `UNNEST(...)` sources
- [x] scalar subqueries beyond `exists(...)`
- [x] `IN (subquery)` support
- [x] quantified subquery comparisons like `= ANY(subquery)` and `> ALL(subquery)`
- [x] builder-level transaction statements in the query DSL
- [x] table-function sources like `generate_series(...)`

## Insert

- [x] multi-row `insert`
- [x] `insert ... select ...`
- [x] `DEFAULT VALUES`
- [x] richer conflict targeting
- [x] named conflict constraints
- [x] partial-index conflict predicates
- [x] conflict `where(...)`
- [x] first-class `excluded(...)` helpers
- [x] insert-source forms from `VALUES`, `UNNEST`, or subqueries

## Update And Delete

- [x] `update ... from ...`
- [x] join-driven updates
- [x] multi-table updates
- [x] `delete ... using ...`
- [x] join-driven deletes
- [x] multi-table deletes
- [x] `order by` on `update` / `delete`
- [x] `limit` on `update` / `delete`
- [x] mutation-specific locking clauses beyond select locks

## Cross-Cutting

- [x] `TRUNCATE`
- [x] `MERGE`
- [x] transaction/savepoint builder layer
- [x] standalone `VALUES(...)` query-source helpers
- [x] standalone `UNNEST(...)` query-source helpers
