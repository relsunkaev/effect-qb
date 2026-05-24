import type * as Expression from "../../internal/scalar.js";
import type { NonEmptyStringInput } from "../../internal/table-options.js";
import { postgresDatatypeFamilies, postgresDatatypeKinds } from "./spec.js";
export declare const postgresDatatypes: {
    custom: <Kind extends string>(kind: NonEmptyStringInput<Kind>) => Expression.DbType.Base<"postgres", Kind>;
    text: () => Expression.DbType.Base<"postgres", "text"> & {
        readonly family: "text";
        readonly runtime: "string";
        readonly compareGroup: "text";
        readonly castTargets: readonly ["text", "numeric", "boolean", "date", "time", "timestamp", "interval", "binary", "uuid", "json", "xml", "bit", "oid", "identifier", "network", "spatial", "textsearch", "range", "multirange", "array", "money", "null"];
        readonly traits: {
            readonly textual: true;
            readonly ordered: true;
        };
    };
    varchar: () => Expression.DbType.Base<"postgres", "varchar"> & {
        readonly family: "text";
        readonly runtime: "string";
        readonly compareGroup: "text";
        readonly castTargets: readonly ["text", "numeric", "boolean", "date", "time", "timestamp", "interval", "binary", "uuid", "json", "xml", "bit", "oid", "identifier", "network", "spatial", "textsearch", "range", "multirange", "array", "money", "null"];
        readonly traits: {
            readonly textual: true;
            readonly ordered: true;
        };
    };
    char: () => Expression.DbType.Base<"postgres", "char"> & {
        readonly family: "text";
        readonly runtime: "string";
        readonly compareGroup: "text";
        readonly castTargets: readonly ["text", "numeric", "boolean", "date", "time", "timestamp", "interval", "binary", "uuid", "json", "xml", "bit", "oid", "identifier", "network", "spatial", "textsearch", "range", "multirange", "array", "money", "null"];
        readonly traits: {
            readonly textual: true;
            readonly ordered: true;
        };
    };
    citext: () => Expression.DbType.Base<"postgres", "citext"> & {
        readonly family: "text";
        readonly runtime: "string";
        readonly compareGroup: "text";
        readonly castTargets: readonly ["text", "numeric", "boolean", "date", "time", "timestamp", "interval", "binary", "uuid", "json", "xml", "bit", "oid", "identifier", "network", "spatial", "textsearch", "range", "multirange", "array", "money", "null"];
        readonly traits: {
            readonly textual: true;
            readonly ordered: true;
        };
    };
    name: () => Expression.DbType.Base<"postgres", "name"> & {
        readonly family: "text";
        readonly runtime: "string";
        readonly compareGroup: "text";
        readonly castTargets: readonly ["text", "numeric", "boolean", "date", "time", "timestamp", "interval", "binary", "uuid", "json", "xml", "bit", "oid", "identifier", "network", "spatial", "textsearch", "range", "multirange", "array", "money", "null"];
        readonly traits: {
            readonly textual: true;
            readonly ordered: true;
        };
    };
    uuid: () => Expression.DbType.Base<"postgres", "uuid"> & {
        readonly family: "uuid";
        readonly runtime: "string";
        readonly compareGroup: "uuid";
        readonly castTargets: readonly ["uuid", "text"];
        readonly traits: {
            readonly ordered: true;
        };
    };
    int2: () => Expression.DbType.Base<"postgres", "int2"> & {
        readonly family: "numeric";
        readonly runtime: "number";
        readonly compareGroup: "numeric";
        readonly castTargets: readonly ["numeric", "text", "boolean", "date", "time", "timestamp", "interval", "uuid", "bit", "oid", "money"];
        readonly traits: {
            readonly ordered: true;
        };
    };
    int4: () => Expression.DbType.Base<"postgres", "int4"> & {
        readonly family: "numeric";
        readonly runtime: "number";
        readonly compareGroup: "numeric";
        readonly castTargets: readonly ["numeric", "text", "boolean", "date", "time", "timestamp", "interval", "uuid", "bit", "oid", "money"];
        readonly traits: {
            readonly ordered: true;
        };
    };
    int8: () => Expression.DbType.Base<"postgres", "int8"> & {
        readonly family: "numeric";
        readonly runtime: "bigintString";
        readonly compareGroup: "numeric";
        readonly castTargets: readonly ["numeric", "text", "boolean", "date", "time", "timestamp", "interval", "uuid", "bit", "oid", "money"];
        readonly traits: {
            readonly ordered: true;
        };
    };
    numeric: () => Expression.DbType.Base<"postgres", "numeric"> & {
        readonly family: "numeric";
        readonly runtime: "decimalString";
        readonly compareGroup: "numeric";
        readonly castTargets: readonly ["numeric", "text", "boolean", "date", "time", "timestamp", "interval", "uuid", "bit", "oid", "money"];
        readonly traits: {
            readonly ordered: true;
        };
    };
    float4: () => Expression.DbType.Base<"postgres", "float4"> & {
        readonly family: "numeric";
        readonly runtime: "number";
        readonly compareGroup: "numeric";
        readonly castTargets: readonly ["numeric", "text", "boolean", "date", "time", "timestamp", "interval", "uuid", "bit", "oid", "money"];
        readonly traits: {
            readonly ordered: true;
        };
    };
    float8: () => Expression.DbType.Base<"postgres", "float8"> & {
        readonly family: "numeric";
        readonly runtime: "number";
        readonly compareGroup: "numeric";
        readonly castTargets: readonly ["numeric", "text", "boolean", "date", "time", "timestamp", "interval", "uuid", "bit", "oid", "money"];
        readonly traits: {
            readonly ordered: true;
        };
    };
    money: () => Expression.DbType.Base<"postgres", "money"> & {
        readonly family: "money";
        readonly runtime: "number";
        readonly compareGroup: "money";
        readonly castTargets: readonly ["money", "text", "numeric"];
        readonly traits: {
            readonly ordered: true;
        };
    };
    bool: () => Expression.DbType.Base<"postgres", "bool"> & {
        readonly family: "boolean";
        readonly runtime: "boolean";
        readonly compareGroup: "boolean";
        readonly castTargets: readonly ["boolean", "text", "numeric"];
        readonly traits: {};
    };
    date: () => Expression.DbType.Base<"postgres", "date"> & {
        readonly family: "date";
        readonly runtime: "localDate";
        readonly compareGroup: "date";
        readonly castTargets: readonly ["date", "timestamp", "text"];
        readonly traits: {
            readonly ordered: true;
        };
    };
    time: () => Expression.DbType.Base<"postgres", "time"> & {
        readonly family: "time";
        readonly runtime: "localTime";
        readonly compareGroup: "time";
        readonly castTargets: readonly ["time", "timestamp", "text"];
        readonly traits: {
            readonly ordered: true;
        };
    };
    timetz: () => Expression.DbType.Base<"postgres", "timetz"> & {
        readonly family: "time";
        readonly runtime: "offsetTime";
        readonly compareGroup: "time";
        readonly castTargets: readonly ["time", "timestamp", "text"];
        readonly traits: {
            readonly ordered: true;
        };
    };
    timestamp: () => Expression.DbType.Base<"postgres", "timestamp"> & {
        readonly family: "timestamp";
        readonly runtime: "localDateTime";
        readonly compareGroup: "timestamp";
        readonly castTargets: readonly ["timestamp", "date", "text"];
        readonly traits: {
            readonly ordered: true;
        };
    };
    timestamptz: () => Expression.DbType.Base<"postgres", "timestamptz"> & {
        readonly family: "timestamp";
        readonly runtime: "instant";
        readonly compareGroup: "timestamp";
        readonly castTargets: readonly ["timestamp", "date", "text"];
        readonly traits: {
            readonly ordered: true;
        };
    };
    interval: () => Expression.DbType.Base<"postgres", "interval"> & {
        readonly family: "interval";
        readonly runtime: "string";
        readonly compareGroup: "interval";
        readonly castTargets: readonly ["interval", "text"];
        readonly traits: {
            readonly ordered: true;
        };
    };
    bytea: () => Expression.DbType.Base<"postgres", "bytea"> & {
        readonly family: "binary";
        readonly runtime: "bytes";
        readonly compareGroup: "binary";
        readonly castTargets: readonly ["binary", "text"];
        readonly traits: {};
    };
    xml: () => Expression.DbType.Base<"postgres", "xml"> & {
        readonly family: "xml";
        readonly runtime: "string";
        readonly compareGroup: "xml";
        readonly castTargets: readonly ["xml", "text"];
        readonly traits: {};
    };
    bit: () => Expression.DbType.Base<"postgres", "bit"> & {
        readonly family: "bit";
        readonly runtime: "string";
        readonly compareGroup: "bit";
        readonly castTargets: readonly ["bit", "text", "numeric"];
        readonly traits: {};
    };
    varbit: () => Expression.DbType.Base<"postgres", "varbit"> & {
        readonly family: "bit";
        readonly runtime: "string";
        readonly compareGroup: "bit";
        readonly castTargets: readonly ["bit", "text", "numeric"];
        readonly traits: {};
    };
    oid: () => Expression.DbType.Base<"postgres", "oid"> & {
        readonly family: "oid";
        readonly runtime: "number";
        readonly compareGroup: "oid";
        readonly castTargets: readonly ["oid", "text", "numeric"];
        readonly traits: {
            readonly ordered: true;
        };
    };
    xid: () => Expression.DbType.Base<"postgres", "xid"> & {
        readonly family: "oid";
        readonly runtime: "number";
        readonly compareGroup: "oid";
        readonly castTargets: readonly ["oid", "text", "numeric"];
        readonly traits: {
            readonly ordered: true;
        };
    };
    xid8: () => Expression.DbType.Base<"postgres", "xid8"> & {
        readonly family: "oid";
        readonly runtime: "bigintString";
        readonly compareGroup: "oid";
        readonly castTargets: readonly ["oid", "text", "numeric"];
        readonly traits: {
            readonly ordered: true;
        };
    };
    cid: () => Expression.DbType.Base<"postgres", "cid"> & {
        readonly family: "oid";
        readonly runtime: "number";
        readonly compareGroup: "oid";
        readonly castTargets: readonly ["oid", "text", "numeric"];
        readonly traits: {
            readonly ordered: true;
        };
    };
    tid: () => Expression.DbType.Base<"postgres", "tid"> & {
        readonly family: "identifier";
        readonly runtime: "string";
        readonly compareGroup: "identifier";
        readonly castTargets: readonly ["identifier", "text"];
        readonly traits: {};
    };
    regclass: () => Expression.DbType.Base<"postgres", "regclass"> & {
        readonly family: "identifier";
        readonly runtime: "string";
        readonly compareGroup: "identifier";
        readonly castTargets: readonly ["identifier", "text"];
        readonly traits: {};
    };
    regtype: () => Expression.DbType.Base<"postgres", "regtype"> & {
        readonly family: "identifier";
        readonly runtime: "string";
        readonly compareGroup: "identifier";
        readonly castTargets: readonly ["identifier", "text"];
        readonly traits: {};
    };
    regproc: () => Expression.DbType.Base<"postgres", "regproc"> & {
        readonly family: "identifier";
        readonly runtime: "string";
        readonly compareGroup: "identifier";
        readonly castTargets: readonly ["identifier", "text"];
        readonly traits: {};
    };
    regprocedure: () => Expression.DbType.Base<"postgres", "regprocedure"> & {
        readonly family: "identifier";
        readonly runtime: "string";
        readonly compareGroup: "identifier";
        readonly castTargets: readonly ["identifier", "text"];
        readonly traits: {};
    };
    regoper: () => Expression.DbType.Base<"postgres", "regoper"> & {
        readonly family: "identifier";
        readonly runtime: "string";
        readonly compareGroup: "identifier";
        readonly castTargets: readonly ["identifier", "text"];
        readonly traits: {};
    };
    regoperator: () => Expression.DbType.Base<"postgres", "regoperator"> & {
        readonly family: "identifier";
        readonly runtime: "string";
        readonly compareGroup: "identifier";
        readonly castTargets: readonly ["identifier", "text"];
        readonly traits: {};
    };
    regconfig: () => Expression.DbType.Base<"postgres", "regconfig"> & {
        readonly family: "identifier";
        readonly runtime: "string";
        readonly compareGroup: "identifier";
        readonly castTargets: readonly ["identifier", "text"];
        readonly traits: {};
    };
    regdictionary: () => Expression.DbType.Base<"postgres", "regdictionary"> & {
        readonly family: "identifier";
        readonly runtime: "string";
        readonly compareGroup: "identifier";
        readonly castTargets: readonly ["identifier", "text"];
        readonly traits: {};
    };
    pg_lsn: () => Expression.DbType.Base<"postgres", "pg_lsn"> & {
        readonly family: "identifier";
        readonly runtime: "string";
        readonly compareGroup: "identifier";
        readonly castTargets: readonly ["identifier", "text"];
        readonly traits: {};
    };
    txid_snapshot: () => Expression.DbType.Base<"postgres", "txid_snapshot"> & {
        readonly family: "identifier";
        readonly runtime: "string";
        readonly compareGroup: "identifier";
        readonly castTargets: readonly ["identifier", "text"];
        readonly traits: {};
    };
    inet: () => Expression.DbType.Base<"postgres", "inet"> & {
        readonly family: "network";
        readonly runtime: "string";
        readonly compareGroup: "network";
        readonly castTargets: readonly ["network", "text"];
        readonly traits: {};
    };
    cidr: () => Expression.DbType.Base<"postgres", "cidr"> & {
        readonly family: "network";
        readonly runtime: "string";
        readonly compareGroup: "network";
        readonly castTargets: readonly ["network", "text"];
        readonly traits: {};
    };
    macaddr: () => Expression.DbType.Base<"postgres", "macaddr"> & {
        readonly family: "network";
        readonly runtime: "string";
        readonly compareGroup: "network";
        readonly castTargets: readonly ["network", "text"];
        readonly traits: {};
    };
    macaddr8: () => Expression.DbType.Base<"postgres", "macaddr8"> & {
        readonly family: "network";
        readonly runtime: "string";
        readonly compareGroup: "network";
        readonly castTargets: readonly ["network", "text"];
        readonly traits: {};
    };
    point: () => Expression.DbType.Base<"postgres", "point"> & {
        readonly family: "spatial";
        readonly runtime: "unknown";
        readonly compareGroup: "spatial";
        readonly castTargets: readonly ["spatial", "text"];
        readonly traits: {};
    };
    line: () => Expression.DbType.Base<"postgres", "line"> & {
        readonly family: "spatial";
        readonly runtime: "unknown";
        readonly compareGroup: "spatial";
        readonly castTargets: readonly ["spatial", "text"];
        readonly traits: {};
    };
    lseg: () => Expression.DbType.Base<"postgres", "lseg"> & {
        readonly family: "spatial";
        readonly runtime: "unknown";
        readonly compareGroup: "spatial";
        readonly castTargets: readonly ["spatial", "text"];
        readonly traits: {};
    };
    box: () => Expression.DbType.Base<"postgres", "box"> & {
        readonly family: "spatial";
        readonly runtime: "unknown";
        readonly compareGroup: "spatial";
        readonly castTargets: readonly ["spatial", "text"];
        readonly traits: {};
    };
    path: () => Expression.DbType.Base<"postgres", "path"> & {
        readonly family: "spatial";
        readonly runtime: "unknown";
        readonly compareGroup: "spatial";
        readonly castTargets: readonly ["spatial", "text"];
        readonly traits: {};
    };
    polygon: () => Expression.DbType.Base<"postgres", "polygon"> & {
        readonly family: "spatial";
        readonly runtime: "unknown";
        readonly compareGroup: "spatial";
        readonly castTargets: readonly ["spatial", "text"];
        readonly traits: {};
    };
    circle: () => Expression.DbType.Base<"postgres", "circle"> & {
        readonly family: "spatial";
        readonly runtime: "unknown";
        readonly compareGroup: "spatial";
        readonly castTargets: readonly ["spatial", "text"];
        readonly traits: {};
    };
    tsvector: () => Expression.DbType.Base<"postgres", "tsvector"> & {
        readonly family: "textsearch";
        readonly runtime: "string";
        readonly compareGroup: "textsearch";
        readonly castTargets: readonly ["textsearch", "text"];
        readonly traits: {};
    };
    tsquery: () => Expression.DbType.Base<"postgres", "tsquery"> & {
        readonly family: "textsearch";
        readonly runtime: "string";
        readonly compareGroup: "textsearch";
        readonly castTargets: readonly ["textsearch", "text"];
        readonly traits: {};
    };
    int4range: () => Expression.DbType.Base<"postgres", "int4range"> & {
        readonly family: "range";
        readonly runtime: "unknown";
        readonly compareGroup: "range";
        readonly castTargets: readonly ["range", "text"];
        readonly traits: {};
    };
    int8range: () => Expression.DbType.Base<"postgres", "int8range"> & {
        readonly family: "range";
        readonly runtime: "unknown";
        readonly compareGroup: "range";
        readonly castTargets: readonly ["range", "text"];
        readonly traits: {};
    };
    numrange: () => Expression.DbType.Base<"postgres", "numrange"> & {
        readonly family: "range";
        readonly runtime: "unknown";
        readonly compareGroup: "range";
        readonly castTargets: readonly ["range", "text"];
        readonly traits: {};
    };
    tsrange: () => Expression.DbType.Base<"postgres", "tsrange"> & {
        readonly family: "range";
        readonly runtime: "unknown";
        readonly compareGroup: "range";
        readonly castTargets: readonly ["range", "text"];
        readonly traits: {};
    };
    tstzrange: () => Expression.DbType.Base<"postgres", "tstzrange"> & {
        readonly family: "range";
        readonly runtime: "unknown";
        readonly compareGroup: "range";
        readonly castTargets: readonly ["range", "text"];
        readonly traits: {};
    };
    daterange: () => Expression.DbType.Base<"postgres", "daterange"> & {
        readonly family: "range";
        readonly runtime: "unknown";
        readonly compareGroup: "range";
        readonly castTargets: readonly ["range", "text"];
        readonly traits: {};
    };
    int4multirange: () => Expression.DbType.Base<"postgres", "int4multirange"> & {
        readonly family: "multirange";
        readonly runtime: "unknown";
        readonly compareGroup: "multirange";
        readonly castTargets: readonly ["multirange", "text"];
        readonly traits: {};
    };
    int8multirange: () => Expression.DbType.Base<"postgres", "int8multirange"> & {
        readonly family: "multirange";
        readonly runtime: "unknown";
        readonly compareGroup: "multirange";
        readonly castTargets: readonly ["multirange", "text"];
        readonly traits: {};
    };
    nummultirange: () => Expression.DbType.Base<"postgres", "nummultirange"> & {
        readonly family: "multirange";
        readonly runtime: "unknown";
        readonly compareGroup: "multirange";
        readonly castTargets: readonly ["multirange", "text"];
        readonly traits: {};
    };
    tsmultirange: () => Expression.DbType.Base<"postgres", "tsmultirange"> & {
        readonly family: "multirange";
        readonly runtime: "unknown";
        readonly compareGroup: "multirange";
        readonly castTargets: readonly ["multirange", "text"];
        readonly traits: {};
    };
    tstzmultirange: () => Expression.DbType.Base<"postgres", "tstzmultirange"> & {
        readonly family: "multirange";
        readonly runtime: "unknown";
        readonly compareGroup: "multirange";
        readonly castTargets: readonly ["multirange", "text"];
        readonly traits: {};
    };
    datemultirange: () => Expression.DbType.Base<"postgres", "datemultirange"> & {
        readonly family: "multirange";
        readonly runtime: "unknown";
        readonly compareGroup: "multirange";
        readonly castTargets: readonly ["multirange", "text"];
        readonly traits: {};
    };
    boolean: () => Expression.DbType.Base<"postgres", "bool"> & {
        readonly family: "boolean";
        readonly runtime: "boolean";
        readonly compareGroup: "boolean";
        readonly castTargets: readonly ["boolean", "text", "numeric"];
        readonly traits: {};
    };
    json: () => Expression.DbType.Json<"postgres", "json">;
    jsonb: () => Expression.DbType.Json<"postgres", "jsonb">;
};
export { postgresDatatypeFamilies, postgresDatatypeKinds };
export type PostgresDatatypeModule = typeof postgresDatatypes;
