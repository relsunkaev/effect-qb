#!/usr/bin/env python3

"""Generate src/mysql/errors/catalog.ts from the official MySQL error docs."""

from __future__ import annotations

import html
import re
from pathlib import Path
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src/mysql/errors/catalog.ts"

PAGES = (
    (
        "server",
        "Server Error",
        "https://dev.mysql.com/doc/mysql-errors/8.4/en/server-error-reference.html",
    ),
    (
        "client",
        "Client Error",
        "https://dev.mysql.com/doc/mysql-errors/8.4/en/client-error-reference.html",
    ),
    (
        "global",
        "Global Error",
        "https://dev.mysql.com/doc/mysql-errors/8.4/en/global-error-reference.html",
    ),
)

ENTRY_RE = re.compile(
    r"Error number:\s*<code class=\"literal\">(?P<errno>\d+)</code>;\s*"
    r"Symbol:\s*(?:<a[^>]*>)?<code class=\"literal\">(?P<symbol>[A-Z0-9_]+)</code>(?:</a>)?;"
    r"(?:\s*SQLSTATE:\s*<code class=\"literal\">(?P<sqlstate>[0-9A-Z]{5})</code>)?",
    re.S,
)

ITEM_RE = re.compile(r"<li class=\"listitem\">(?P<body>.*?)</li>", re.S)
MESSAGE_RE = re.compile(r"<p>\s*Message:\s*(?P<message>.*?)\s*</p>", re.S)
TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")


def fetch(url: str) -> str:
    with urlopen(url) as response:
        return response.read().decode()


def clean_message(fragment: str) -> str:
    text = TAG_RE.sub("", fragment)
    text = html.unescape(text)
    text = SPACE_RE.sub(" ", text).strip()
    return text


def to_tag(category: str, symbol: str) -> str:
    return f"@mysql/{category}/{symbol.lower().replace('_', '-')}"


def render_entry(entry: dict[str, object]) -> str:
    sql_state = (
        f'"{entry["sqlState"]}"' if entry["sqlState"] is not None else "undefined"
    )
    message = (
        str(entry["message"])
        .replace("\\", "\\\\")
        .replace('"', '\\"')
    )
    return (
        f"  {entry['errno']}: {{\n"
        f"    errno: {entry['errno']},\n"
        f'    symbol: "{entry["symbol"]}",\n'
        f'    category: "{entry["category"]}",\n'
        f'    categoryName: "{entry["categoryName"]}",\n'
        f"    sqlState: {sql_state},\n"
        f'    tag: "{entry["tag"]}",\n'
        f'    message: "{message}"\n'
        f"  }},"
    )


def main() -> None:
    entries: list[dict[str, object]] = []

    for category, category_name, url in PAGES:
        html_doc = fetch(url)
        for item_match in ITEM_RE.finditer(html_doc):
            body = item_match.group("body")
            entry_match = ENTRY_RE.search(body)
            message_match = MESSAGE_RE.search(body)
            if entry_match is None or message_match is None:
                continue
            errno = int(entry_match.group("errno"))
            symbol = entry_match.group("symbol")
            sql_state = entry_match.group("sqlstate") or None
            message = clean_message(message_match.group("message"))
            entries.append(
                {
                    "errno": errno,
                    "symbol": symbol,
                    "category": category,
                    "categoryName": category_name,
                    "sqlState": sql_state,
                    "tag": to_tag(category, symbol),
                    "message": message,
                }
            )

    entries.sort(key=lambda entry: int(entry["errno"]))

    lines = [
        "/**",
        " * Official MySQL error catalog from the MySQL 8.4 Error Message Reference.",
        " * Sources:",
        " * - https://dev.mysql.com/doc/mysql-errors/8.4/en/server-error-reference.html",
        " * - https://dev.mysql.com/doc/mysql-errors/8.4/en/client-error-reference.html",
        " * - https://dev.mysql.com/doc/mysql-errors/8.4/en/global-error-reference.html",
        " */",
        "",
        "export const mysqlErrorCategories = {",
        '  server: "Server Error",',
        '  client: "Client Error",',
        '  global: "Global Error"',
        "} as const",
        "",
        "export const mysqlErrorCatalog = {",
        *[render_entry(entry) for entry in entries],
        "} as const",
        "",
        "export const mysqlErrorNumberBySymbol = {",
        *[
            f'  {entry["symbol"]}: {entry["errno"]},'
            for entry in entries
        ],
        "} as const",
        "",
    ]

    OUT.write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
