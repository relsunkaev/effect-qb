import * as Postgres from "effect-qb/postgres";
import { toEnumModel } from "effect-qb/postgres/metadata";

const status = Postgres.schema("public").enum("status", ["pending", "active"] as const);
const authStatus = Postgres.schema("auth").enum("auth_status", ["pending", "active"] as const);

const enumModel = toEnumModel(status);
const authEnumModel = toEnumModel(authStatus);

void enumModel;
void authEnumModel;
