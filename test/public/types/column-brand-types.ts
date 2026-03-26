import type * as Brand from "effect/Brand";
import * as Schema from "effect/Schema";

import * as Mysql from "effect-qb/mysql";
import * as Postgres from "effect-qb/postgres";

type Assert<T extends true> = T;

const postgresAccounts = Postgres.Table.make("accounts", {
  id: Postgres.Column.uuid().pipe(Postgres.Column.primaryKey),
  nickname: Postgres.Column.text().pipe(Postgres.Column.nullable),
  age: Postgres.Column.int(),
});

const inlineBrandedPostgresAccounts = Postgres.Table.make("inline_accounts", {
  id: Postgres.Column.uuid().pipe(
    Postgres.Column.primaryKey,
    Postgres.Column.brand,
  ),
  nickname: Postgres.Column.text().pipe(
    Postgres.Column.nullable,
    Postgres.Column.brand,
  ),
  age: Postgres.Column.int().pipe(Postgres.Column.brand),
});

const brandedPostgresId = postgresAccounts.id.pipe(Postgres.Column.brand);
const brandedPostgresNickname = postgresAccounts.nickname.pipe(
  Postgres.Column.brand,
);
const brandedPostgresAge = postgresAccounts.age.pipe(Postgres.Column.brand);

type PostgresIdRuntime =
  (typeof brandedPostgresId)[Postgres.Expression.TypeId]["runtime"];
type PostgresNicknameRuntime =
  (typeof brandedPostgresNickname)[Postgres.Expression.TypeId]["runtime"];
type PostgresAgeSchema = Schema.Schema.Type<typeof brandedPostgresAge.schema>;
type InlineBrandedPostgresSelect = Schema.Schema.Type<
  typeof inlineBrandedPostgresAccounts.schemas.select
>;

type _AssertPostgresIdRuntime = Assert<
  PostgresIdRuntime extends string & Brand.Brand<"accounts.id"> ? true : false
>;
type _AssertPostgresNicknameRuntime = Assert<
  PostgresNicknameRuntime extends
    | (string & Brand.Brand<"accounts.nickname">)
    | null
    ? true
    : false
>;
type _AssertPostgresAgeSchema = Assert<
  PostgresAgeSchema extends number & Brand.Brand<"accounts.age"> ? true : false
>;
type _AssertInlineBrandedPostgresId = Assert<
  InlineBrandedPostgresSelect["id"] extends string &
    Brand.Brand<"inline_accounts.id">
    ? true
    : false
>;
type _AssertInlineBrandedPostgresNickname = Assert<
  InlineBrandedPostgresSelect["nickname"] extends
    | (string & Brand.Brand<"inline_accounts.nickname">)
    | null
    ? true
    : false
>;
type _AssertInlineBrandedPostgresAge = Assert<
  InlineBrandedPostgresSelect["age"] extends number &
    Brand.Brand<"inline_accounts.age">
    ? true
    : false
>;

const postgresPlan = Postgres.Query.select({
  id: brandedPostgresId,
  nickname: brandedPostgresNickname,
  age: brandedPostgresAge,
}).pipe(Postgres.Query.from(postgresAccounts));

const inlineBrandedPostgresPlan = Postgres.Query.select({
  id: inlineBrandedPostgresAccounts.id,
  nickname: inlineBrandedPostgresAccounts.nickname,
  age: inlineBrandedPostgresAccounts.age,
}).pipe(Postgres.Query.from(inlineBrandedPostgresAccounts));

type PostgresRow = Postgres.Query.ResultRow<typeof postgresPlan>;
type InlineBrandedPostgresRow = Postgres.Query.ResultRow<
  typeof inlineBrandedPostgresPlan
>;

type _AssertInlineBrandedPostgresRowId = Assert<
  InlineBrandedPostgresRow["id"] extends string &
    Brand.Brand<"inline_accounts.id">
    ? true
    : false
>;
type _AssertInlineBrandedPostgresRowNickname = Assert<
  InlineBrandedPostgresRow["nickname"] extends
    | (string & Brand.Brand<"inline_accounts.nickname">)
    | null
    ? true
    : false
>;
type _AssertInlineBrandedPostgresRowAge = Assert<
  InlineBrandedPostgresRow["age"] extends number &
    Brand.Brand<"inline_accounts.age">
    ? true
    : false
>;

const mysqlAccounts = Mysql.Table.make("mysql_accounts", {
  id: Mysql.Column.uuid().pipe(Mysql.Column.primaryKey),
  email: Mysql.Column.text(),
  quota: Mysql.Column.int(),
});

const brandedMysqlEmail = mysqlAccounts.email.pipe(Mysql.Column.brand);
const brandedMysqlQuota = mysqlAccounts.quota.pipe(Mysql.Column.brand);

type MysqlEmailRuntime =
  (typeof brandedMysqlEmail)[Mysql.Expression.TypeId]["runtime"];
type MysqlQuotaSchema = Schema.Schema.Type<typeof brandedMysqlQuota.schema>;

type _AssertMysqlEmailRuntime = Assert<
  MysqlEmailRuntime extends string & Brand.Brand<"mysql_accounts.email">
    ? true
    : false
>;
type _AssertMysqlQuotaSchema = Assert<
  MysqlQuotaSchema extends number & Brand.Brand<"mysql_accounts.quota">
    ? true
    : false
>;

const mysqlPlan = Mysql.Query.select({
  email: brandedMysqlEmail,
  quota: brandedMysqlQuota,
}).pipe(Mysql.Query.from(mysqlAccounts));

type MysqlRow = Mysql.Query.ResultRow<typeof mysqlPlan>;

void brandedPostgresId;
void brandedPostgresNickname;
void brandedPostgresAge;
void postgresPlan;
void inlineBrandedPostgresAccounts;
void inlineBrandedPostgresPlan;
void brandedMysqlEmail;
void brandedMysqlQuota;
void mysqlPlan;
