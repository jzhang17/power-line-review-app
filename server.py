#!/usr/bin/env python3
"""
Power Line Review App — standalone local review UI.

Run:
    python3 server.py

Then open http://127.0.0.1:8765 in your browser.

Loads entities from data/dataset.json, lets you mark each as
qualified / not qualified / maybe, and autosaves your decisions
(plus category/confidence overrides and notes) to
data/review_decisions.json.

Zero dependencies — Python 3.9+ standard library only.
"""
from __future__ import annotations

import csv
import io
import json
import os
import re
from collections import Counter
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
DATA_DIR = APP_DIR / "data"
DATASET_FILE = Path(os.environ.get("DATASET_FILE", DATA_DIR / "dataset.json"))
DECISIONS_FILE = Path(os.environ.get("DECISIONS_FILE", DATA_DIR / "review_decisions.json"))
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8765"))

MARKDOWN_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^\s)]+)\)")
URL_RE = re.compile(r"https?://[^\s<>\])]+")
VALID_DECISIONS = {"", "qualified", "not_qualified", "maybe"}
VALID_CATEGORIES = {"T", "D", "S", "V", "CI"}
VALID_CONFIDENCE = {"", "high", "medium", "low"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean_url(candidate: str) -> str:
    return candidate.rstrip(".,);]")


def extract_links(*chunks: str) -> list[dict[str, str]]:
    seen: set[str] = set()
    links: list[dict[str, str]] = []
    for chunk in chunks:
        if not chunk:
            continue
        for label, url in MARKDOWN_LINK_RE.findall(chunk):
            url = clean_url(url)
            if url and url not in seen:
                seen.add(url)
                links.append({"label": label.strip() or urlparse(url).netloc or url, "url": url})
        for url in URL_RE.findall(chunk):
            url = clean_url(url)
            if url and url not in seen:
                seen.add(url)
                host = urlparse(url).netloc or url
                links.append({"label": host, "url": url})
    return links


def normalize_categories(value) -> list[str]:
    if isinstance(value, list):
        raw_parts = value
    else:
        raw_parts = re.split(r"[|,]+", value or "")

    alias_map = {
        "T": "T", "D": "D", "S": "S", "V": "V", "CI": "CI",
        "TRANSMISSION": "T",
        "DISTRIBUTION": "D",
        "SUBSTATION": "S",
        "VEGETATION": "V",
        "COMMERCIAL & INDUSTRIAL": "CI",
        "COMMERCIAL AND INDUSTRIAL": "CI",
    }

    parts: list[str] = []
    seen: set[str] = set()
    for raw in raw_parts:
        part = str(raw or "").strip().upper()
        if not part:
            continue
        part = alias_map.get(part, part)
        if part in VALID_CATEGORIES and part not in seen:
            seen.add(part)
            parts.append(part)
    return parts


def build_entity_notes(row: dict) -> str:
    bits = []
    if row.get("ownership"):
        bits.append(f"Ownership: {row['ownership']}")
    if row.get("company_size"):
        bits.append(f"Size: {row['company_size']}")
    if row.get("hq_state"):
        bits.append(f"HQ: {row['hq_state']}")
    return " | ".join(bit for bit in bits if bit)


def load_source_records() -> list[dict]:
    if not DATASET_FILE.exists():
        raise FileNotFoundError(
            f"Dataset not found at {DATASET_FILE}. "
            "Place a JSON array of entities at data/dataset.json or set DATASET_FILE env var."
        )

    payload = json.loads(DATASET_FILE.read_text())
    if not isinstance(payload, list):
        raise ValueError("dataset.json must be a JSON array of entity objects")

    records: list[dict] = []
    for idx, row in enumerate(payload, start=1):
        reasoning = (row.get("reasoning") or "").strip()
        entity_url = (row.get("official_website_url") or row.get("website") or "").strip()
        links = extract_links(
            entity_url,
            row.get("domain", ""),
            reasoning,
        )
        records.append(
            {
                "id": (row.get("record_id") or f"rec-{idx:04d}").strip(),
                "index": idx,
                "name": (row.get("name") or "").strip(),
                "entityNotes": build_entity_notes(row),
                "entityUrl": entity_url,
                "sourceUrl": (row.get("source_url") or "").strip(),
                "categories": normalize_categories(row.get("categories")),
                "confidence": (row.get("confidence") or "").strip().lower(),
                "reasoning": reasoning,
                "links": links,
                "runId": (row.get("source_origin") or "").strip(),
                "backend": (row.get("master_status") or "").strip(),
                "sourceStatus": (row.get("master_status") or "").strip(),
                "sourceOrigin": (row.get("source_origin") or "").strip(),
                "sourceDecisionNote": (row.get("review_resolution_notes") or "").strip(),
                "ownerNames": (row.get("owner_names") or "").strip(),
                "ownership": (row.get("ownership") or "").strip(),
                "preEnrichmentReasoning": (row.get("pre_enrichment_reasoning") or "").strip(),
                "comparisonSummary": (row.get("comparison_summary") or "").strip(),
            }
        )
    return records


def load_decisions() -> dict:
    if not DECISIONS_FILE.exists():
        return {"source_file": DATASET_FILE.name, "updated_at": "", "decisions": {}}

    payload = json.loads(DECISIONS_FILE.read_text())
    payload.setdefault("source_file", DATASET_FILE.name)
    payload.setdefault("updated_at", "")
    payload.setdefault("decisions", {})
    return payload


def write_decisions(payload: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DECISIONS_FILE.write_text(json.dumps(payload, indent=2, sort_keys=True))


SOURCE_RECORDS = load_source_records()
SOURCE_LOOKUP = {record["id"]: record for record in SOURCE_RECORDS}


def build_bootstrap() -> dict:
    decision_store = load_decisions()
    category_counts: Counter = Counter()
    source_status_counts: Counter = Counter()

    items: list[dict] = []
    for record in SOURCE_RECORDS:
        saved = decision_store["decisions"].get(record["id"], {})
        current_name = saved.get("name", record["name"])
        current_categories = saved.get("categories", record["categories"])
        current_confidence = saved.get("confidence", record["confidence"])

        for category in current_categories:
            category_counts[category] += 1
        if record.get("sourceStatus"):
            source_status_counts[record["sourceStatus"]] += 1

        items.append(
            {
                **record,
                "originalName": record["name"],
                "name": current_name,
                "originalCategories": record["categories"],
                "originalConfidence": record["confidence"],
                "categories": current_categories,
                "confidence": current_confidence,
                "decision": saved.get("decision", ""),
                "note": saved.get("note", ""),
                "updatedAt": saved.get("updated_at", ""),
            }
        )

    decision_counts = Counter(item["decision"] or "unreviewed" for item in items)
    return {
        "sourceFile": DATASET_FILE.name,
        "decisionFile": str(DECISIONS_FILE.name),
        "total": len(items),
        "categoryCounts": dict(category_counts),
        "decisionCounts": dict(decision_counts),
        "sourceStatusCounts": dict(source_status_counts),
        "items": items,
        "updatedAt": decision_store.get("updated_at", ""),
    }


def export_rows() -> list[dict]:
    bootstrap = build_bootstrap()
    rows = []
    for item in bootstrap["items"]:
        rows.append(
            {
                "id": item["id"],
                "index": item["index"],
                "name": item["name"],
                "original_name": item["originalName"],
                "categories": ",".join(item["categories"]),
                "confidence": item["confidence"],
                "original_categories": ",".join(item["originalCategories"]),
                "original_confidence": item["originalConfidence"],
                "decision": item["decision"],
                "note": item["note"],
                "updated_at": item["updatedAt"],
                "entity_url": item["entityUrl"],
                "source_url": item["sourceUrl"],
                "run_id": item["runId"],
                "backend": item["backend"],
                "source_status": item.get("sourceStatus", ""),
                "source_origin": item.get("sourceOrigin", ""),
            }
        )
    return rows


class ReviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        print(f"[review-app] {self.address_string()} - {fmt % args}")

    def do_GET(self) -> None:
        if self.path == "/api/bootstrap":
            self.respond_json(build_bootstrap())
            return

        if self.path == "/api/export.json":
            self.respond_json(export_rows())
            return

        if self.path == "/api/export.csv":
            rows = export_rows()
            buffer = io.StringIO()
            writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()) if rows else [])
            if rows:
                writer.writeheader()
                writer.writerows(rows)
            payload = buffer.getvalue().encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Content-Disposition", 'attachment; filename="review-export.csv"')
            self.end_headers()
            self.wfile.write(payload)
            return

        if self.path in {"/", "/index.html"}:
            self.path = "/index.html"

        return super().do_GET()

    def do_POST(self) -> None:
        if self.path != "/api/decision":
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown endpoint")
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(content_length)

        try:
            payload = json.loads(body or b"{}")
        except json.JSONDecodeError:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid JSON body")
            return

        record_id = payload.get("id", "").strip()
        decision = payload.get("decision", "").strip()
        note = payload.get("note", "")
        categories = payload.get("categories", SOURCE_LOOKUP.get(record_id, {}).get("categories", []))
        confidence = payload.get("confidence", SOURCE_LOOKUP.get(record_id, {}).get("confidence", ""))

        if record_id not in SOURCE_LOOKUP:
            self.send_error(HTTPStatus.BAD_REQUEST, "Unknown record id")
            return

        if decision not in VALID_DECISIONS:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid decision")
            return

        if not isinstance(categories, list) or any(c not in VALID_CATEGORIES for c in categories):
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid categories")
            return

        if confidence not in VALID_CONFIDENCE:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid confidence")
            return

        store = load_decisions()
        now = utc_now()
        store["updated_at"] = now
        store["decisions"][record_id] = {
            "decision": decision,
            "note": note,
            "categories": categories,
            "confidence": confidence,
            "updated_at": now,
            "name": SOURCE_LOOKUP[record_id]["name"],
        }
        write_decisions(store)
        self.respond_json({"ok": True, "updatedAt": now})

    def respond_json(self, payload) -> None:
        content = json.dumps(payload).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), ReviewHandler)
    print(f"Review app running at http://{HOST}:{PORT}")
    print(f"Dataset:       {DATASET_FILE}")
    print(f"Decisions:     {DECISIONS_FILE}")
    print(f"Loaded {len(SOURCE_RECORDS)} record(s). Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        server.server_close()


if __name__ == "__main__":
    main()
