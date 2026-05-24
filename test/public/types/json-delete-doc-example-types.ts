import * as Std from "effect-qb"
import * as Schema from "effect/Schema";

import { Function as F, Json as J, Query as Q } from "effect-qb/postgres"

const docs = Std.Table.make("docs", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  payload: Std.Column.json(
    Schema.Struct({
      profile: Schema.Struct({
        address: Schema.Struct({
          city: Schema.String,
          postcode: Schema.NullOr(Schema.String),
        }),
        tags: Schema.Array(Schema.String),
      }),
      note: Schema.NullOr(Schema.String),
    }),
  ),
});

const cityPath = J.json.path(
  J.json.key("profile"),
  J.json.key("address"),
  J.json.key("city"),
);

const compatibleObject = J.json.buildObject({
  profile: {
    address: {
      city: "Macon",
      postcode: "1000",
    },
    tags: ["travel"],
  },
  note: null,
});

const incompatibleObject = J.json.delete(compatibleObject, cityPath);

Q.insert(docs, {
  id: "doc-1",
  // @ts-expect-error nested json output must still satisfy the column schema
  payload: incompatibleObject,
});
