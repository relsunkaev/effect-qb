import { Column as PgColumn } from "effect-qb/postgres"
import * as Std from "effect-qb"
import * as Schema from "effect/Schema";

import { Function as F, Json as J, Query as Q } from "effect-qb/postgres"

const docs = Std.Table.make("docs", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  payload: PgColumn.jsonb(
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

const notes = Std.Table.make("notes", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  docId: Std.Column.uuid().pipe(Std.Column.unique),
  authorId: Std.Column.uuid(),
  text: Std.Column.text(),
});

const authors = Std.Table.make("authors", {
  id: Std.Column.uuid().pipe(Std.Column.primaryKey),
  name: Std.Column.text(),
});

const result = Q.select({ id: docs.id, note: notes.text, author: authors.name }).pipe(
  Q.from(docs),
  Q.leftJoin(notes, Q.eq(docs.id, notes.docId)),
  Q.leftJoin(authors, Q.eq(notes.authorId, authors.id)),
  Q.where(Q.isNull(authors.name)),
);

type Test = Q.ResultRow<typeof result>;

const cityPath = J.json.path(J.json.key("profile"), J.json.key("address"), J.json.key("city"));

const compatibleObject = J.jsonb.buildObject({
  profile: {
    address: {
      city: "Paris",
      postcode: "1000",
    },
    tags: ["travel"],
  },
  note: null,
});

const incompatibleObject = J.jsonb.delete(compatibleObject, cityPath);

Q.insert(docs, {
  id: "doc-1",
  // @ts-expect-error nested json output must still satisfy the column schema
  payload: incompatibleObject,
});
