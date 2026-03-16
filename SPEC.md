## Composable Type‑Safe Query API — Behavior‑Only Specification (Effect‑SQL Foundation)

### 0) Purpose & Scope

A composable query layer that represents database queries as immutable logical plans. The layer prioritizes static safety (types, nullability, dialect, database identity) and predictable behavior across supported SQL dialects. This document specifies observable behavior only; it contains no implementation guidance.

---

### 1) Core Principles

- **Purity:** All query builders and operators are pure; they return new plans without side effects.
- **Determinism:** Given identical inputs (schema, parameters, policies), a plan yields the same structural result shape and constraints.
- **Separation of Concerns:** Plan construction is distinct from plan execution. Execution is the only effectful boundary.
- **Single Source of Truth:** Schema metadata determines column types, foreign keys, and constraints used by the layer.

---

### 2) Core Concepts

- **Expression:** A typed, composable term representing a scalar or derived value. Expressions carry runtime type, database type, nullability, dialect capabilities, provenance, aggregation kind, and optional collation.
- **Column:** A leaf expression that refers to a concrete schema column.
- **Plan:** A logical query plan that aggregates a set of expressions, a fixed database identity, a dialect capability set, and a provenance graph of referenced sources.
- **Executor:** An execution service bound to a single database identity and a single SQL dialect. An executor may only execute plans that match both.

---

### 3) Invariants

- **Database Identity:** Every expression and plan is stamped with exactly one database identity. Operators reject any attempt to combine different identities. Executors refuse to run mismatched identities.
- **Dialect Mask:** Every expression and plan carries a set of supported dialects derived from its parts. Composition narrows support to the intersection. If the intersection is empty at any point, plan construction fails.
- **Nullability Lattice:** Nullability of expressions is one of `never`, `maybe`, or `always`. Operators transform nullability deterministically (see §6 and §7).
- **Aggregation Kind:** Each expression is classified as `scalar`, `aggregate`, or `window`. Projection rules prohibit mixing kinds without grouping semantics.
- **Provenance Graph:** Each plan maintains a set of referenced sources and connectivity edges introduced by joins or join‑equivalent predicates.

---

### 4) Supported Behaviors (High‑Level)

- Construct plans from schema sources.
- Build expressions via selections, projections, predicates, ordering, grouping, windowing, and joins.
- Attach optional policies (e.g., timeouts, read vs write role, row‑level constraints) that do not alter semantics, only validation and execution behavior.
- Obtain an introspection report of a plan (see §12) without executing it.

---

### 5) Database Types (Behavior)

- Every column and derived expression exposes a **database type** that encodes its SQL‑level scalar kind (e.g., UUID, numeric with precision/scale, text, timestamp variants, JSON, arrays).
- **Comparability:** Binary comparison and join predicates are allowed only when database types are comparable within the current dialect set.
- **Castability:** Explicit cast operations are permitted only when a valid dialect‑specific cast exists. Casts do not change database identity or provenance.
- **Numeric Arithmetic:** Numeric operations define a resultant precision and scale that conservatively account for overflow and scale propagation.
- **Temporal Semantics:** Timestamp with/without time zone are not comparable without an explicit normalization step. Behavior is to reject such comparisons at plan construction time unless normalized.

---

### 6) Nullability Propagation (Behavior)

- **Inner Join:** Nullability of referenced columns is preserved.
- **Left Join:** All columns on the right side become `maybe` regardless of their prior state.
- **Right Join:** Symmetric to left join.
- **Full Join:** Columns on both sides become `maybe`.
- **`IS NOT NULL` Predicate:** The referenced expression becomes `never` for the remainder of the plan.
- **`IS NULL` Predicate:** The referenced expression becomes `always` for the remainder of the plan.
- **Equality Predicate Between Two Expressions:** Both expressions become `never` (rows with NULL on either side are eliminated by definition).
- **Contradictory Refinements:** Attempts to refine an expression to mutually incompatible nullability states within the same branch are rejected.

---

### 7) Grouping & Aggregation (Behavior)

- **Kinds:** Aggregates yield `aggregate`, window functions yield `window`, all others are `scalar`.
- **Projection Rules:** A projection in a grouped context may contain only group keys (scalar) and aggregates. Mixing non‑key scalar expressions with aggregates is rejected.
- **Nullability in Aggregates:** Aggregates define their nullability behavior explicitly (e.g., `COUNT(*)` is `never`; `MIN(col)` reflects `maybe` unless constrained by predicates).

---

### 8) Dialect Behavior & Interference Prevention

- **Operator Availability:** Some operators are dialect‑specific (e.g., case‑insensitive match). Using a dialect‑specific operator removes unsupported dialects from the plan. If no dialects remain, plan construction fails.
- **Executor Compatibility:** An executor can only run plans that declare support for its dialect. Attempting execution otherwise is rejected.
- **Collation:** Text expressions carry optional collation. Ordering/compare operations across incompatible collations are rejected unless explicitly reconciled.

---

### 9) Database Identity Rules

- **Single‑DB Composition:** All plan construction operators require inputs with the same database identity. Cross‑database composition is rejected.
- **Transactions:** Transaction scopes are bound to a single database identity. Any plan constructed or executed within a transaction must share that identity.
- **Federation:** Cross‑database operations are only allowed via explicit, non‑SQL bridging mechanisms that materialize results; no implicit federation is permitted.

---

### 10) Foreign Key Awareness & Join Inference

- **Schema‑Driven:** The layer consumes foreign key metadata to infer join predicates when requested.
- **Inference Rules:**
  - If exactly one foreign key exists between the chosen sources, a join predicate is inferred using the declared key pairs.
  - If multiple foreign keys exist, the join is rejected unless the caller specifies which one to use.
  - If no foreign keys exist, inference is rejected and a join predicate must be provided explicitly.

- **Type Discipline:** Inferred joins require database‑type compatibility. If compatibility requires casts, inference is rejected unless the caller opts into cast‑based inference.
- **Nullability Impact:** Inferred equality predicates refine both sides to `never` for the remainder of the plan.

---

### 11) Missing Joins & Cartesian Product Prevention

- **Connectivity Requirement:** A plan referencing multiple sources must be graph‑connected via join operators or recognized join‑equivalent predicates (e.g., equality between columns from different sources).
- **Default Stance:** Cartesian products are rejected by default.
- **Explicit Opt‑In:** Callers may explicitly mark a plan segment as permitting a Cartesian product. This opt‑in is local and does not propagate implicitly.

---

### 12) Diagnostics & Introspection (Non‑executing)

- **Explainability:** A plan can be introspected to reveal:
  - Referenced sources and their connectivity
  - Declared database identity and dialect support
  - Nullability map for all referenced expressions
  - Database types for all expressions and projected fields
  - Aggregation context (grouping keys, aggregate/window expressions)
  - Foreign keys used for any inferred joins

- **Error Messaging:** Rejections include actionable reasons (e.g., dialect mismatch, incompatible database types, ambiguous FK, cartesian product forbidden, collation conflict, temporal normalization required).

---

### 13) Execution Boundary (Behavior)

- **Eligibility Check:** Execution is permitted only when the plan’s database identity matches the executor’s identity and the plan supports the executor’s dialect.
- **Decoder Contract:** On successful execution, returned rows conform to the projected runtime types and nullability states implied by the plan. Any deviation is considered a runtime contract violation.
- **Policy Effects:** Execution policies (timeouts, roles, hints) may alter execution characteristics but never the observable semantics of the plan’s result shape.

---

### 14) Pagination & Ordering (Behavior)

- **Ordering Stability:** Seek‑based pagination relies on a deterministic ordering; attempts to paginate without a total order are rejected.
- **Cursor Semantics:** Cursors encode all necessary ordering keys and direction. Using a cursor under a different ordering is rejected.
- **Nulls Ordering:** Behavior for NULLS FIRST/LAST must be explicit when relevant; defaults are dialect‑specific and surfaced in diagnostics.

---

### 15) Safety Guarantees (Summary)

- No cross‑database composition.
- No dialect‑unsupported operators at execution time.
- No invalid comparisons or joins between incompatible database types.
- No illegal aggregate/scalar mixtures in grouped projections.
- No silent nullability surprises: all refinements and join effects are captured and persisted through the plan.
- No accidental Cartesian products without explicit consent.

---

### 16) Non‑Goals

- This layer does not define migration behavior, DDL authoring, or schema evolution strategies.
- This layer does not promise physical‑plan stability across releases; only logical semantics are stable.
- This layer does not perform implicit cross‑database federation.

---

### 17) Interoperability Expectations

- Compatible with Effect‑style execution models and resource scopes.
- Schema metadata must be obtainable from the host system and remain consistent during plan construction.
- Error surfaces and diagnostics are stable and suitable for automated checks (e.g., CI gates).
