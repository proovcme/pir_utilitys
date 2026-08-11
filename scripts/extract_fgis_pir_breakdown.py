#!/usr/bin/env python3
"""Extract official stage and section shares from the OJGN FGIS PDFs."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

import pdfplumber


ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "outputs" / "fgis-pir" / "2-q-2026" / "documents" / "design"
OUTPUT = ROOT / "src" / "data" / "fgisPirBreakdown.json"
GUIDS = (
    "b90117ab-5223-4a7a-89ae-a8bcbb88f689",
    "75096832-7e41-4a3a-83aa-e1a3719be062",
)

SECTIONS = (
    ("ПЗ", "Пояснительная записка"),
    ("ПЗУ", "Схема планировочной организации земельного участка"),
    ("АР", "Архитектурные решения"),
    ("КР", "Конструктивные и объёмно-планировочные решения"),
    ("ТХ", "Технологические решения"),
    ("ОВ", "Отопление и вентиляция"),
    ("ВК", "Водоснабжение и водоотведение"),
    ("ЭО", "Электроснабжение"),
    ("СС", "Сети связи"),
    ("АВТ", "Автоматизация"),
    ("КОН", "Кондиционирование воздуха"),
    ("ХС", "Холодоснабжение"),
    ("ГС", "Газоснабжение"),
    ("ПОС", "Проект организации строительства"),
    ("ООС", "Охрана окружающей среды"),
    ("ПБ", "Пожарная безопасность"),
    ("ОДИ", "Доступ для инвалидов"),
    ("ТБЭ", "Безопасная эксплуатация объекта"),
    ("ЭЭ", "Энергетическая эффективность и приборы учёта"),
    ("СМ", "Смета на строительство"),
)

TABLE_TITLES = {
    "1": "Жилые объекты для постоянного проживания",
    "2": "Жилые объекты специализированного назначения",
    "3": "Гостиницы и объекты временного проживания",
    "4": "Объекты лечебного обеспечения",
    "5": "Лечебно-оздоровительные объекты и объекты отдыха",
    "6": "Объекты ветеринарии",
    "7": "Объекты спорта",
    "8": "Объекты образования",
    "9": "Объекты культуры, искусства и истории",
    "10": "Религиозные и культовые объекты",
    "11": "Объекты научной и исследовательской деятельности",
    "12": "Объекты торговли",
    "13": "Объекты общественного питания",
    "14": "Объекты административно-делового управления",
    "15": "Объекты безопасности, правопорядка и правосудия",
    "16": "Объекты ликвидации чрезвычайных ситуаций",
    "17": "Объекты бытового обслуживания",
}


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def row_key(value: Any) -> str:
    normalized = clean(value).replace(" ", "").strip(".")
    return normalized if re.search(r"\d", normalized) else ""


def number(value: Any) -> float:
    normalized = re.sub(r"\s+", "", str(value or "")).replace(",", ".")
    if not normalized or normalized in {"-", "–", "—"}:
        return 0.0
    return float(normalized)


def stage(value: Any) -> str:
    normalized = re.sub(r"\s+", "", str(value or "")).upper().replace("P", "Р")
    if normalized in {"П+", "П+Р"}:
        return "combined"
    return {"П": "pd", "Р": "rd"}.get(normalized, "")


def compact_stage(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or "")).upper().replace("P", "Р")


def shares(values: list[float]) -> dict[str, float]:
    return {code: value for (code, _), value in zip(SECTIONS, values, strict=True)}


def extract_document(guid: str) -> dict[str, Any]:
    path = ARCHIVE / f"{guid}.pdf"
    if not path.exists():
        raise FileNotFoundError(path)

    tables: dict[str, list[dict[str, Any]]] = {}
    current_code = ""
    current_object: dict[str, Any] | None = None
    decimal_tail_object: dict[str, Any] | None = None
    parent_name = ""
    parent_id = ""

    with pdfplumber.open(path) as pdf:
        for page_number in range(41, 73):
            page = pdf.pages[page_number - 1]
            table_codes = re.findall(r"Таблица\s+(\d+)", page.extract_text() or "")
            table_code_index = 0

            for extracted in page.extract_tables():
                if not extracted or max(len(row) for row in extracted) != 23:
                    continue
                is_header = clean(extracted[0][0]).replace(" ", "") in {"№", "N"}
                if is_header:
                    if table_code_index >= len(table_codes):
                        raise RuntimeError(f"No relative table code on page {page_number}")
                    current_code = table_codes[table_code_index]
                    table_code_index += 1
                    tables.setdefault(current_code, [])
                    current_object = None
                    decimal_tail_object = None
                    parent_name = ""
                    parent_id = ""
                    data_rows = extracted[3:]
                else:
                    data_rows = extracted

                if not current_code:
                    continue

                for raw in data_rows:
                    padded = list(raw) + [None] * (23 - len(raw))
                    item_id = row_key(padded[0])
                    item_name = clean(padded[1])
                    printed_stage = compact_stage(padded[2])
                    item_stage = stage(padded[2])
                    values = [number(value) for value in padded[3:23]]

                    if (
                        printed_stage == "Р"
                        and decimal_tail_object is current_object
                        and values
                        and all(value in {0.0, 5.0} for value in values)
                    ):
                        # A row printed at the bottom of a page can be split
                        # after the first decimal digit. The next page then
                        # contains only the trailing 5s and the last character
                        # of the label "П + Р". Join those decimal tails.
                        combined = current_object["stages"]["combined"]
                        for (section_code, _), tail in zip(SECTIONS, values, strict=True):
                            if tail:
                                combined[section_code] = round(combined[section_code] + tail / 100, 2)
                        current_object["totals"]["combined"] = round(sum(combined.values()), 2)
                        decimal_tail_object = None
                        continue

                    if item_id and not item_stage:
                        parent_id = item_id
                        parent_name = item_name
                        current_object = None
                        continue
                    if not item_id and item_name and not item_stage and current_object is None and parent_name:
                        parent_name = clean(f"{parent_name} {item_name}")
                        continue

                    if item_id and item_stage:
                        full_name = (
                            f"{parent_name} — {item_name}"
                            if parent_name and item_id.startswith(f"{parent_id}.")
                            else item_name
                        )
                        current_object = {
                            "id": item_id,
                            "name": full_name,
                            "page": page_number,
                            "stages": {},
                            "totals": {},
                        }
                        decimal_tail_object = None
                        tables[current_code].append(current_object)
                        if not item_id.startswith(f"{parent_id}."):
                            parent_id = ""
                            parent_name = ""
                    elif (
                        item_stage
                        and current_object
                        and item_stage in current_object["stages"]
                        and set(current_object["stages"]) == {"pd", "rd", "combined"}
                        and current_code == "1"
                        and current_object["id"] == "3.1"
                        and item_stage == "pd"
                    ):
                        # In the published PDF the 3.2 label is outside the
                        # detected grid, while its three value rows are intact.
                        current_object = {
                            "id": "3.2",
                            "name": f"{parent_name} — 10 этажей и более",
                            "page": page_number,
                            "stages": {},
                            "totals": {},
                        }
                        decimal_tail_object = None
                        tables[current_code].append(current_object)
                    elif item_name:
                        if current_object and item_name not in current_object["name"]:
                            current_object["name"] = clean(f"{current_object['name']} {item_name}")
                        elif not current_object and parent_name:
                            parent_name = clean(f"{parent_name} {item_name}")

                    if not current_object or not item_stage:
                        continue
                    if item_stage == "rd" and sum(values) == 0 and "combined" in current_object["stages"]:
                        # A page break can split the printed label "П + Р".
                        continue
                    current_object["stages"][item_stage] = shares(values)
                    current_object["totals"][item_stage] = round(sum(values), 2)
                    decimal_tail_object = current_object if printed_stage == "П+" else None

    flat_objects = [item for items in tables.values() for item in items]
    incomplete = [
        f"{code}:{item['id']}"
        for code, items in tables.items()
        for item in items
        if set(item["stages"]) != {"pd", "rd", "combined"}
    ]
    if incomplete:
        raise RuntimeError(f"Incomplete relative rows: {', '.join(incomplete)}")
    if len(flat_objects) != 122:
        raise RuntimeError(f"Expected 122 relative objects, extracted {len(flat_objects)}")

    return {
        "guid": guid,
        "sourcePdfSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "stageShares": {"pd": 40, "rd": 60, "combined": 100},
        "stageSourcePage": 2,
        "tableCount": len(tables),
        "objectCount": len(flat_objects),
        "tables": [
            {
                "code": code,
                "priceTableCode": f"3.{code}",
                "title": TABLE_TITLES[code],
                "page": min(item["page"] for item in tables[code]),
                "objects": tables[code],
            }
            for code in sorted(tables, key=int)
        ],
    }


def main() -> None:
    documents = [extract_document(guid) for guid in GUIDS]
    payload = {
        "schemaVersion": 1,
        "snapshotPeriod": "2 квартал 2026 г.",
        "extraction": "official-pdf-relative-cost-v1",
        "sections": [{"code": code, "name": name} for code, name in SECTIONS],
        "documents": documents,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {OUTPUT.relative_to(ROOT)}: {len(documents)} documents, "
        f"{sum(item['tableCount'] for item in documents)} tables, "
        f"{sum(item['objectCount'] for item in documents)} objects"
    )


if __name__ == "__main__":
    main()
