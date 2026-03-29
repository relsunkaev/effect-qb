import * as Schema from "effect/Schema";

import { Column as C, Function as F, Json as J, Query as Q, Table } from "effect-qb/postgres";

const docs = Table.make("docs", {
  id: C.uuid().pipe(C.primaryKey),
  payload: C.jsonb(
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

const notes = Table.make("notes", {
  id: C.uuid().pipe(C.primaryKey),
  docId: C.uuid().pipe(C.unique),
  authorId: C.uuid(),
  text: C.text(),
});

const authors = Table.make("authors", {
  id: C.uuid().pipe(C.primaryKey),
  name: C.text(),
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
