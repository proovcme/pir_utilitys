from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from rule_engine import inspect_page, inspect_rule, inspect_stamp, process_job


# Tauri decodes sidecar streams as UTF-8. Windows can otherwise select cp1251
# for a detached executable, so make the stream contract explicit.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="backslashreplace")


def main() -> int:
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=False)
    source.add_argument("--job-json")
    source.add_argument("--job-file")
    source.add_argument("--inspect-json")
    source.add_argument("--inspect-rule-json")
    source.add_argument("--inspect-page-json")
    parser.add_argument("--profile")
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--no-preview", action="store_true")
    args = parser.parse_args()
    try:
        if args.inspect_page_json is not None:
            request = json.loads(args.inspect_page_json)
            result = inspect_page(request["input_pdf"], int(request.get("page", 1)))
        elif args.inspect_rule_json is not None:
            request = json.loads(args.inspect_rule_json)
            result = inspect_rule(request["input_pdf"], request["rule"])
        elif args.inspect_json is not None:
            request = json.loads(args.inspect_json)
            result = inspect_stamp(request["input_pdf"])
        elif args.job_json is not None:
            job = json.loads(args.job_json)
        elif args.job_file is not None:
            job = json.loads(Path(args.job_file).read_text(encoding="utf-8-sig"))
        elif args.profile and args.input and args.output:
            profile = json.loads(Path(args.profile).read_text(encoding="utf-8-sig"))
            job = {
                "input_pdf": args.input,
                "output_pdf": args.output,
                "make_previews": not args.no_preview,
                "rules": profile["rules"],
            }
        else:
            parser.error("Укажите --job-json, --job-file или набор --profile/--input/--output")
        if args.inspect_json is None and args.inspect_rule_json is None and args.inspect_page_json is None:
            result = process_job(job)
        # ASCII JSON is valid UTF-8 under every Windows code page and preserves
        # Cyrillic losslessly via JSON escapes.
        print(json.dumps(result, ensure_ascii=True), flush=True)
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=True), flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
