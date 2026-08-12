#!/usr/bin/env python3
"""Download the public FGIS CS PIR catalog through a VPS and build an offline snapshot.

The calculator consumes only the normalized JSON snapshot. Official documents are
stored under outputs/ for audit and are intentionally not bundled into the web app.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import mimetypes
import os
import re
import shlex
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[1]
API_BASE = "https://fgiscs.minstroyrf.ru/api"
PORTAL_BASE = "https://fgiscs.minstroyrf.ru/frsn/pir"
NEWS_URL = "https://gge.ru/press-center/news/vse-piry-vo-fgis-tss/"
SNAPSHOT_PATH = ROOT / "src/data/fgisPirSnapshot.json"
MANIFEST_PATH = ROOT / "src/data/fgisPirManifest.json"

REMOTE_JSON = r"""
import requests, sys
r = requests.get(sys.argv[1], timeout=180)
r.raise_for_status()
sys.stdout.buffer.write(r.content)
"""

REMOTE_FILE = r"""
import json, requests, sys
r = requests.get(sys.argv[1], timeout=300)
r.raise_for_status()
meta = {
  "contentType": r.headers.get("content-type"),
  "contentDisposition": r.headers.get("content-disposition"),
  "size": len(r.content),
}
sys.stderr.write("FGIS_META " + json.dumps(meta, ensure_ascii=False) + "\n")
sys.stdout.buffer.write(r.content)
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ssh-host", default="zt-box", help="VPS SSH alias used as the network transport")
    parser.add_argument("--direct", action="store_true", help="Fetch directly instead of through SSH")
    parser.add_argument("--metadata-only", action="store_true", help="Refresh JSON without downloading documents")
    parser.add_argument("--workers", type=int, default=4, help="Parallel document downloads")
    return parser.parse_args()


class Transport:
    def __init__(self, ssh_host: str, direct: bool) -> None:
        self.ssh_host = ssh_host
        self.direct = direct
        self.control_path = f"/tmp/calc-fgis-{os.getpid()}-%C"

    def _ssh_command(self, program: str, url: str) -> list[str]:
        return [
            "ssh",
            "-o", "BatchMode=yes",
            "-o", "ControlMaster=auto",
            "-o", "ControlPersist=120",
            "-o", f"ControlPath={self.control_path}",
            self.ssh_host,
            f"python3 -c {shlex.quote(program)} {shlex.quote(url)}",
        ]

    def json(self, path: str) -> Any:
        url = f"{API_BASE}/{path}"
        if self.direct:
            from urllib.request import urlopen

            with urlopen(url, timeout=180) as response:
                return json.load(response)
        completed = subprocess.run(self._ssh_command(REMOTE_JSON, url), check=True, capture_output=True)
        return json.loads(completed.stdout)

    def file(self, url: str, target: Path) -> dict[str, Any]:
        target.parent.mkdir(parents=True, exist_ok=True)
        if self.direct:
            from urllib.request import urlopen

            with urlopen(url, timeout=300) as response, target.open("wb") as output:
                content = response.read()
                output.write(content)
                return {
                    "contentType": response.headers.get("content-type"),
                    "contentDisposition": response.headers.get("content-disposition"),
                    "size": len(content),
                }

        with target.open("wb") as output:
            completed = subprocess.run(
                self._ssh_command(REMOTE_FILE, url),
                check=True,
                stdout=output,
                stderr=subprocess.PIPE,
            )
        marker = next(
            (line.removeprefix("FGIS_META ") for line in completed.stderr.decode("utf-8").splitlines() if line.startswith("FGIS_META ")),
            None,
        )
        if not marker:
            raise RuntimeError(f"FGIS response metadata is missing for {url}")
        return json.loads(marker)


def api_path(name: str, period_id: int | None = None) -> str:
    return name if period_id is None else f"{name}?periodId={period_id}"


def parse_decimal(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace(" ", "").replace(",", "."))
    except ValueError:
        return None


def normalize_tree(payload: dict[str, Any], route: str, kind: str) -> dict[str, Any]:
    hierarchy = payload.get("hierarchy") or []
    categories = {item["guid"]: item.get("name") or "Без категории" for item in hierarchy}
    documents = []
    for item in payload.get("documents") or []:
        guid = item["guid"]
        documents.append({
            "guid": guid,
            "categoryGuid": item.get("parentGuid"),
            "category": categories.get(item.get("parentGuid"), "Без категории"),
            "name": item.get("name") or "Без названия",
            "approvingAct": item.get("approvingActInfo"),
            "priceLevel": item.get("rtmPriceLevel"),
            "index": parse_decimal(item.get("index")),
            "filePath": item.get("filePath"),
            "kind": kind,
            "portalUrl": f"{PORTAL_BASE}/{route}/{guid}",
            "downloadUrl": f"{API_BASE}/NormLegalDocFilePublished/GetByGuid/{guid}?asArchive=false",
        })
    return {"hierarchy": hierarchy, "documents": documents}


def canonical_digest(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def fetch_all(transport: Transport) -> tuple[dict[str, Any], dict[str, Any]]:
    periods_payload = transport.json("PirIndex/Periods")
    period_rows = periods_payload.get("items") or []
    raw: dict[str, Any] = {
        "periods": periods_payload,
        "methods": transport.json("PirMethods"),
        "methodsMeta": transport.json("PirMethods/Meta"),
        "examples": transport.json("PirCalculationExamples"),
        "examplesMeta": transport.json("PirCalculationExamples/Meta"),
        "archiveMethods": transport.json("PirArchive/Methods"),
        "archiveMethodsMeta": transport.json("PirArchive/Methods/Meta"),
        "archiveNorms": transport.json("PirArchive/Sn"),
        "archiveNormsMeta": transport.json("PirArchive/Sn/Meta"),
        "periodData": {},
    }
    normalized_periods = []
    for row in period_rows:
        period_id = int(row["value"])
        survey = transport.json(api_path("SurveyWorkSn", period_id))
        design = transport.json(api_path("SurveyDesignSn", period_id))
        indexes = transport.json(api_path("PirIndex", period_id))
        raw["periodData"][str(period_id)] = {"survey": survey, "design": design, "indexes": indexes}
        normalized_periods.append({
            "id": period_id,
            "label": row.get("text") or str(period_id),
            "survey": normalize_tree(survey, "engineeringSurveysEstimatedStandards", "survey"),
            "design": normalize_tree(design, "projectWorkEstimatedStandards", "design"),
            "indexes": normalize_tree(indexes, "indexes", "index"),
        })

    active_period_id = int(periods_payload["activePeriodId"])
    active_period = next(item for item in normalized_periods if item["id"] == active_period_id)
    methods = normalize_tree(raw["methods"], "methods", "method")
    examples = normalize_tree(raw["examples"], "examples", "example")
    archive_methods = normalize_tree(raw["archiveMethods"], "archive", "archiveMethod")
    archive_norms = normalize_tree(raw["archiveNorms"], "archive", "archiveNorm")
    fetched_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    snapshot: dict[str, Any] = {
        "schemaVersion": 1,
        "fetchedAt": fetched_at,
        "transport": "direct" if transport.direct else f"ssh:{transport.ssh_host}",
        "source": {
            "portalUrl": f"{PORTAL_BASE}/methods",
            "newsUrl": NEWS_URL,
            "apiBase": API_BASE,
        },
        "activePeriodId": active_period_id,
        "periods": normalized_periods,
        "methods": methods,
        "examples": examples,
        "archive": {"methods": archive_methods, "norms": archive_norms},
        "counts": {
            "methods": len(methods["documents"]),
            "survey": len(active_period["survey"]["documents"]),
            "design": len(active_period["design"]["documents"]),
            "indexes": len(active_period["indexes"]["documents"]),
            "examples": len(examples["documents"]),
            "archive": len(archive_methods["documents"]) + len(archive_norms["documents"]),
        },
    }
    snapshot["catalogSha256"] = canonical_digest(snapshot)
    return raw, snapshot


def original_filename(content_disposition: str | None) -> str | None:
    if not content_disposition:
        return None
    utf_match = re.search(r"filename\*=UTF-8''([^;]+)", content_disposition, flags=re.IGNORECASE)
    if utf_match:
        return unquote(utf_match.group(1))
    plain_match = re.search(r'filename="?([^";]+)', content_disposition, flags=re.IGNORECASE)
    return plain_match.group(1) if plain_match else None


def extension_for(meta: dict[str, Any], filename: str | None) -> str:
    if filename and Path(filename).suffix:
        return Path(filename).suffix.lower()
    content_type = str(meta.get("contentType") or "").split(";", 1)[0]
    return mimetypes.guess_extension(content_type) or ".bin"


def current_documents(snapshot: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    active = next(item for item in snapshot["periods"] if item["id"] == snapshot["activePeriodId"])
    grouped = {
        "methods": snapshot["methods"]["documents"],
        "survey": active["survey"]["documents"],
        "design": active["design"]["documents"],
        "indexes": active["indexes"]["documents"],
        "examples": snapshot["examples"]["documents"],
    }
    return [(group, document) for group, documents in grouped.items() for document in documents]


def download_documents(
    transport: Transport,
    snapshot: dict[str, Any],
    output_dir: Path,
    workers: int,
) -> dict[str, Any]:
    jobs = current_documents(snapshot)

    def download(job: tuple[str, dict[str, Any]]) -> dict[str, Any]:
        group, document = job
        guid = document["guid"]
        temporary = output_dir / "documents" / group / f"{guid}.download"
        meta = transport.file(document["downloadUrl"], temporary)
        name = original_filename(meta.get("contentDisposition"))
        final = temporary.with_suffix(extension_for(meta, name))
        temporary.replace(final)
        digest = hashlib.sha256(final.read_bytes()).hexdigest()
        return {
            "group": group,
            "guid": guid,
            "name": document["name"],
            "originalFilename": name,
            "contentType": meta.get("contentType"),
            "size": final.stat().st_size,
            "sha256": digest,
            "localPath": str(final.relative_to(ROOT)),
            "sourceUrl": document["downloadUrl"],
        }

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        records = list(executor.map(download, jobs))
    records.sort(key=lambda item: (item["group"], item["name"], item["guid"]))
    return {
        "schemaVersion": 1,
        "fetchedAt": snapshot["fetchedAt"],
        "catalogSha256": snapshot["catalogSha256"],
        "documentCount": len(records),
        "totalBytes": sum(item["size"] for item in records),
        "documents": records,
    }


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    transport = Transport(args.ssh_host, args.direct)
    raw, snapshot = fetch_all(transport)
    active = next(item for item in snapshot["periods"] if item["id"] == snapshot["activePeriodId"])
    period_slug = re.sub(r"[^0-9a-z]+", "-", active["label"].lower().replace("квартал", "q")).strip("-")
    output_dir = ROOT / "outputs" / "fgis-pir" / period_slug
    write_json(output_dir / "raw-api.json", raw)
    write_json(output_dir / "snapshot.json", snapshot)

    if args.metadata_only:
        manifest = {
            "schemaVersion": 1,
            "fetchedAt": snapshot["fetchedAt"],
            "catalogSha256": snapshot["catalogSha256"],
            "documentCount": 0,
            "totalBytes": 0,
            "documents": [],
            "note": "Metadata-only check; tracked snapshot and manifest were not changed.",
        }
        write_json(output_dir / "metadata-manifest.json", manifest)
        print(json.dumps({
            "snapshotCandidate": str(output_dir / "snapshot.json"),
            "catalogSha256": snapshot["catalogSha256"],
            "counts": snapshot["counts"],
            "trackedFilesChanged": False,
        }, ensure_ascii=False, indent=2))
        return 0
    else:
        manifest = download_documents(transport, snapshot, output_dir, args.workers)
    write_json(SNAPSHOT_PATH, snapshot)
    write_json(output_dir / "manifest.json", manifest)
    write_json(MANIFEST_PATH, manifest)
    snapshot["download"] = {
        "documentCount": manifest["documentCount"],
        "totalBytes": manifest["totalBytes"],
        "manifestSha256": canonical_digest(manifest),
    }
    write_json(output_dir / "snapshot.json", snapshot)
    write_json(SNAPSHOT_PATH, snapshot)
    print(json.dumps({
        "snapshot": str(SNAPSHOT_PATH),
        "manifest": str(MANIFEST_PATH),
        "output": str(output_dir),
        "catalogSha256": snapshot["catalogSha256"],
        "counts": snapshot["counts"],
        "downloadedDocuments": manifest["documentCount"],
        "downloadedBytes": manifest["totalBytes"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
