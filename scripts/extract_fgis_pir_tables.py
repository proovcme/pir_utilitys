#!/usr/bin/env python3
"""Extract checked a+b*X rows from selected official FGIS PIR PDFs.

The generated JSON is a browser input, not a replacement for the PDFs. Each
row keeps its table, page, interval and source digest so the UI can expose the
exact official context instead of asking the user for anonymous a, b and X.
"""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pdfplumber


ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "outputs" / "fgis-pir" / "2-q-2026" / "documents" / "design"
OUTPUT = ROOT / "src" / "data" / "fgisPirTables.json"


@dataclass(frozen=True)
class Source:
    guid: str
    mode: str


SOURCES = (
    Source("b90117ab-5223-4a7a-89ae-a8bcbb88f689", "modern"),
    Source("75096832-7e41-4a3a-83aa-e1a3719be062", "modern"),
)


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def number(value: Any) -> float | None:
    raw = clean(value).replace(" ", "").replace(",", ".")
    if not raw or raw in {"-", "–", "—"}:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def interval_bounds(label: str) -> tuple[float | None, float | None, bool, bool]:
    normalized = clean(label).lower().replace("ё", "е")
    values = [
        float(item.replace(" ", "").replace(",", "."))
        for item in re.findall(r"\d[\d ]*(?:[.,]\d+)?", normalized)
    ]
    if not values:
        return None, None, True, True
    if normalized.startswith("свыше"):
        return values[0], values[1] if len(values) > 1 else None, False, True
    if normalized.startswith("до"):
        return 0, values[0], True, True
    if normalized.startswith("от"):
        return values[0], values[1] if len(values) > 1 else None, True, True
    if len(values) == 1:
        return values[0], values[0], True, True
    return values[0], values[1], True, True


def table_codes(text: str, mode: str) -> list[str]:
    codes = re.findall(r"Таблица\s+(?:N\s*)?([0-9]+(?:\.[0-9]+)*)", text, re.I)
    if mode == "modern":
        return [code for code in codes if re.fullmatch(r"3\.\d+", code)]
    return [code for code in codes if code in {"1", "2", "3", "5", "7"}]


def table_has_header(table: list[list[Any]], mode: str) -> bool:
    sample = " ".join(clean(cell) for row in table[:4] for cell in row)
    if mode == "modern":
        # The same official document uses both quoted and unquoted column
        # letters ("а"/"в" in tables 3.1-3.13, а/в in 3.14-3.17).
        # The semantic headings are stable across both layouts.
        return "Натуральный показатель" in sample and "Параметры цены проектных работ" in sample
    return "Единица измерения" in sample and "Постоянные величины" in sample


def normalize_unit(unit: str, previous: str) -> str:
    value = clean(unit)
    if value in {'"', "''", "“", "”"}:
        return previous
    return value or previous


def extract_source(source: Source) -> dict[str, Any]:
    path = ARCHIVE / f"{source.guid}.pdf"
    if not path.exists():
        raise FileNotFoundError(path)

    tables: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    current_object = ""
    current_unit = ""

    with pdfplumber.open(path) as pdf:
        for page_index, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            codes = table_codes(text, source.mode)
            code_index = 0
            extracted_tables = page.extract_tables()
            has_supported_header = any(table_has_header(table, source.mode) for table in extracted_tables if table)
            if (
                current is not None
                and codes
                and current["code"] not in codes
                and not has_supported_header
            ):
                # A new table uses another calculation layout. Do not attach its
                # rows to the last supported a+b*X table.
                current = None
                current_object = ""
                current_unit = ""

            for extracted in extracted_tables:
                if not extracted:
                    continue
                width = max(len(row) for row in extracted)
                expected_width = 6 if source.mode == "modern" else 5
                has_header = table_has_header(extracted, source.mode)

                if has_header:
                    code = codes[code_index] if code_index < len(codes) else f"page-{page_index + 1}"
                    code_index += 1
                    title = clean(extracted[0][0])
                    current = {
                        "code": code,
                        "title": title,
                        "page": page_index + 1,
                        "rows": [],
                    }
                    tables.append(current)
                    current_object = ""
                    current_unit = ""

                if current is None or width != expected_width:
                    continue

                for row in extracted:
                    padded = list(row) + [None] * (expected_width - len(row))
                    if source.mode == "modern":
                        row_number, name, interval, unit, raw_a, raw_b = padded[:6]
                    else:
                        row_number, name, unit, raw_a, raw_b = padded[:5]
                        name_clean = clean(name)
                        match = re.search(
                            r"((?:свыше|от|до)\s+[\d ,]+(?:\s+до\s+[\d ,]+)?(?:\s+включительно)?)$",
                            name_clean,
                            re.I,
                        )
                        interval = match.group(1) if match else ""
                        if match:
                            name = name_clean[: match.start()].strip()

                    a = number(raw_a)
                    b = number(raw_b)
                    name_value = clean(name).rstrip(":")
                    interval_value = clean(interval)
                    unit_value = normalize_unit(clean(unit), current_unit)

                    if name_value and not any(
                        marker in name_value
                        for marker in ("Наименование объекта", "Наименование градостроительной")
                    ):
                        current_object = name_value
                    if unit_value and "измерения" not in unit_value.lower():
                        current_unit = unit_value

                    if (
                        a is None
                        and b is None
                        and not name_value
                        and interval_value.lower().startswith("до")
                        and current["rows"]
                        and current["rows"][-1]["max"] is None
                    ):
                        previous = current["rows"][-1]
                        merged_interval = f"{previous['rangeLabel']} {interval_value}"
                        minimum, maximum, minimum_inclusive, maximum_inclusive = interval_bounds(merged_interval)
                        previous.update(
                            {
                                "rangeLabel": merged_interval,
                                "min": minimum,
                                "max": maximum,
                                "minInclusive": minimum_inclusive,
                                "maxInclusive": maximum_inclusive,
                            }
                        )
                        continue

                    if not current_object or not interval_value or a is None or b is None:
                        continue

                    minimum, maximum, minimum_inclusive, maximum_inclusive = interval_bounds(interval_value)
                    row_id = clean(row_number) or str(len(current["rows"]) + 1)
                    current["rows"].append(
                        {
                            "id": f"{current['code']}:{row_id}:{len(current['rows']) + 1}",
                            "number": clean(row_number),
                            "objectName": current_object,
                            "rangeLabel": interval_value,
                            "min": minimum,
                            "max": maximum,
                            "minInclusive": minimum_inclusive,
                            "maxInclusive": maximum_inclusive,
                            "unit": current_unit,
                            "aThousandRub": a,
                            "bThousandRubPerUnit": b,
                            "page": page_index + 1,
                        }
                    )

    usable_tables = [table for table in tables if table["rows"]]
    if not usable_tables:
        raise RuntimeError(f"No usable tables extracted from {path.name}")

    return {
        "guid": source.guid,
        "sourcePdfSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "tableCount": len(usable_tables),
        "rowCount": sum(len(table["rows"]) for table in usable_tables),
        "tables": usable_tables,
        "percentTables": extract_percent_tables(path),
    }


def extract_percent_tables(path: Path) -> list[dict[str, Any]]:
    """Extract table 3.18 used when an object is absent from tables 3.1-3.17.

    The published values are interpolation points: construction cost in the
    01.01.2021 price level (million rubles) and the corresponding percentage.
    """

    points: list[dict[str, Any]] = []
    active = False

    with pdfplumber.open(path) as pdf:
        for page_index, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            if re.search(r"Таблица\s+3\.18\b", text, re.I):
                active = True
            elif active and re.search(r"Таблица\s+3\.19\b", text, re.I):
                break
            if not active:
                continue

            for extracted in page.extract_tables():
                if not extracted or max(len(row) for row in extracted) != 3:
                    continue
                for row in extracted:
                    padded = list(row) + [None] * (3 - len(row))
                    row_number, raw_cost, raw_percent = padded[:3]
                    percent = number(raw_percent)
                    cost_label = clean(raw_cost)
                    if cost_label == "2" and clean(raw_percent) == "3":
                        continue
                    cost_values = [
                        float(item.replace(" ", "").replace(",", "."))
                        for item in re.findall(r"\d[\d ]*(?:[.,]\d+)?", cost_label)
                    ]
                    if percent is None or not cost_values:
                        continue
                    points.append(
                        {
                            "id": clean(row_number) or str(len(points) + 1),
                            "constructionCostMillionRub": cost_values[-1],
                            "designPercent": percent,
                            "sourceLabel": cost_label,
                            "page": page_index + 1,
                        }
                    )

    if not points:
        return []
    return [
        {
            "code": "3.18",
            "title": "Объекты, не вошедшие в номенклатуру таблиц 3.1-3.17",
            "page": points[0]["page"],
            "points": points,
        }
    ]


def main() -> None:
    documents = [extract_source(source) for source in SOURCES]
    payload = {
        "schemaVersion": 2,
        "snapshotPeriod": "2 квартал 2026 г.",
        "extraction": "official-pdf-table-v1",
        "documents": documents,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {OUTPUT.relative_to(ROOT)}: "
        f"{len(documents)} documents, "
        f"{sum(document['tableCount'] for document in documents)} tables, "
        f"{sum(document['rowCount'] for document in documents)} rows"
    )


if __name__ == "__main__":
    main()
