# Numeric division and cast proposal

Status: approved on 2026-09-07 for `effect-qb-98t` and `effect-qb-ah4`.
Division still requires implementation; native numeric casts already exist.

## Proposed API

Add `Pg.Function.divide(left, right)`, `My.Function.divide(left, right)` and
`Sq.Function.divide(left, right)`. Do not add root `Function.divide`: identical
integer inputs do not have compatible cross-engine division semantics.
Use the existing dialect numeric input/result machinery and binary expression
AST, with result metadata owned by each dialect. Do not rewrite division into
casts, zero guards or JavaScript arithmetic. Callers choose those operations.

Representative caller after approval:

```ts
Pg.Function.divide(Cast.to(5, Pg.Type.int4()), Cast.to(2, Pg.Type.int4()))
```

It returns integer 2, not 2.5. The same operator under MySQL returns a decimal
string. Concrete provenance must reject mixed dialect operands. Non-numeric
expressions are rejected even where an engine would coerce text at runtime.

The next callers are the existing dialect numeric integration suites and user
queries composing division with the already-shipped rounding functions. Keep
promotion logic private to the dialect owner; no separate numeric registry.

## Engine evidence

`division-contract.integration.ts` probes the existing SQL clients against
PostgreSQL 16.15, MySQL 8.4.11 and SQLite 3.54.0.

| Operands | PostgreSQL | MySQL | SQLite |
| --- | --- | --- | --- |
| Integer 5 / 2 | Integer 2 | Decimal string `2.5000` at default increment | Integer 2 |
| Integer -5 / 2 | Integer -2 | Decimal string `-2.5000` | Integer -2 |
| Exact numeric | Decimal string | Decimal string | INTEGER or REAL according to values |
| Approximate operand | Floating-point result | JavaScript number | JavaScript number |
| Zero denominator | Error for integer, numeric and float8 | NULL in SELECT | NULL |

PostgreSQL smallint/smallint remains smallint; int4/int8 becomes bigint, decoded
as a string. Numeric/float4 resolves to double precision in the live probe;
result metadata cannot be inferred solely by ranking operand names. The
implementation needs kind-pair coverage before exposing those overloads.
See [PostgreSQL mathematical operators](https://www.postgresql.org/docs/16/functions-math.html).

MySQL exact division scale depends on the numerator scale plus session
`div_precision_increment`. Tests cover increments 4 and 6. Native `DIV` returns
an integer quotient but is a different operation, not an implementation of the
proposed `divide`. DML error behavior depends on SQL mode and is not established
by SELECT nullability probes. See
[MySQL arithmetic operators](https://dev.mysql.com/doc/refman/8.4/en/arithmetic-functions.html).

SQLite NUMERIC casts do not force fractional division: cast integer 5 divided
by cast integer 2 remains 2. Integer overflow can promote to REAL, including
minimum signed integer divided by -1. A witness is not a promise of arbitrary
precision. See [SQLite expressions](https://www.sqlite.org/lang_expr.html).

## Approved numeric cast policy

Keep unqualified `Type.numeric()` and `Type.decimal()` as native engine casts.
Do not add portable precision/scale parameters: SQLite cannot uphold the same
exact-decimal storage or arithmetic contract. Column DDL precision is separate.

The existing `coercion-contract.integration.ts` verifies a fractional cast
through all three production executors: PostgreSQL returns `2.675`, MySQL
returns `3`, and SQLite returns `2.675` through the standard string mapping.
Public type tests verify the string result, not value preservation. MySQL's
scale-zero default is specified in its
[cast documentation](https://dev.mysql.com/doc/refman/8.4/en/cast-functions.html).

These limitations are documented in the README casting contract.
Dialect-specific precision parameters are a separate alternative, not silently
included in this proposal. Existing typed fragments can express an explicit
engine cast today; no additional escape hatch is needed.

## Implementation acceptance

After approval, prove each supported input-kind pair's result DB type and
executor decoding, paired accepted/rejected type cases, operand nullability,
zero behavior and nested rounding. Include integer width, mixed approximate
inputs and SQLite overflow promotion. Preserve MySQL session configuration;
tests restore changed settings on their reserved transaction connection.
