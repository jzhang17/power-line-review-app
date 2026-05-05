#!/usr/bin/env python3
"""
Power Line Review App — standalone local review UI.

Run:
    python3 server.py

Then open http://127.0.0.1:8765 in your browser.

Loads entities from data/dataset.json, lets you mark each as
qualified / not qualified / maybe, edit categories / confidence /
T-D-S-Other percentage breakdown / client-facing reasoning, and
autosaves your decisions (plus all overrides) to data/review_decisions.json.

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
VALID_NQ_REASONS = {
    "",
    "n/a",
    "services_not_grid_related",
    "ownership_misfit",
    "size_misfit",
    "defunct",
    "non_us",
    "evidence_insufficient",
}


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


def safe_int(v) -> int | None:
    if v is None or v == "":
        return None
    try:
        n = int(v)
    except (TypeError, ValueError):
        try:
            n = int(float(v))
        except (TypeError, ValueError):
            return None
    if n < 0:
        return 0
    if n > 100:
        return 100
    return n


def safe_str_list(v) -> list[str]:
    if not isinstance(v, list):
        return []
    return [str(x).strip() for x in v if str(x).strip()]


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
        internal_reasoning = (row.get("internal_reasoning") or "").strip()
        entity_url = (row.get("official_website_url") or row.get("website") or "").strip()
        links = extract_links(
            entity_url,
            row.get("domain", ""),
            reasoning,
            internal_reasoning,
            *(row.get("ownership_evidence_urls") or []),
            *(row.get("identity_evidence_urls") or []),
        )
        record_id = (row.get("record_id") or f"rec-{idx:04d}").strip()
        hubspot_id = (row.get("hubspot_id") or record_id).strip()
        records.append(
            {
                "id": record_id,
                "hubspotId": hubspot_id,
                "index": idx,
                "name": (row.get("name") or "").strip(),
                "originalName": (row.get("original_name") or row.get("name") or "").strip(),
                "domain": (row.get("domain") or "").strip(),
                "hqState": (row.get("hq_state") or "").strip(),
                "entityNotes": build_entity_notes(row),
                "entityUrl": entity_url,
                "sourceUrl": (row.get("source_url") or "").strip(),
                "categories": normalize_categories(row.get("categories")),
                "confidence": (row.get("confidence") or "").strip().lower(),
                "reasoning": reasoning,
                "internalReasoning": internal_reasoning,
                "links": links,
                "runId": (row.get("source_origin") or "").strip(),
                "backend": (row.get("master_status") or "").strip(),
                "sourceStatus": (row.get("master_status") or "").strip(),
                "sourceOrigin": (row.get("source_origin") or "").strip(),
                "sourceDecisionNote": (row.get("review_resolution_notes") or "").strip(),
                "ownerNames": (row.get("owner_names") or "").strip() if not isinstance(row.get("owner_names"), list) else "; ".join(row["owner_names"]),
                "ownership": (row.get("ownership") or "").strip(),
                "companySize": (row.get("company_size") or "").strip(),
                "aliases": safe_str_list(row.get("aliases")),
                "ownershipEvidenceUrls": safe_str_list(row.get("ownership_evidence_urls")),
                "identityEvidenceUrls": safe_str_list(row.get("identity_evidence_urls")),
                "preEnrichmentReasoning": (row.get("pre_enrichment_reasoning") or "").strip(),
                "comparisonSummary": (row.get("comparison_summary") or "").strip(),
                "transmissionPct": safe_int(row.get("transmission_pct")),
                "distributionPct": safe_int(row.get("distribution_pct")),
                "substationPct": safe_int(row.get("substation_pct")),
                "otherPct": safe_int(row.get("other_pct")),
                "serviceFit": (row.get("service_fit") or "").strip(),
                "ownershipFit": (row.get("ownership_fit") or "").strip(),
                "sizeFit": (row.get("size_fit") or "").strip(),
                "viability": (row.get("viability") or "").strip(),
                "websiteConfidence": (row.get("website_confidence") or "").strip(),
                "nqReasonCategory": (row.get("nq_reason_category") or "").strip(),
                "duplicateDomainCluster": (row.get("duplicate_domain_cluster") or "").strip(),
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
        current_reasoning = saved.get("reasoning", record["reasoning"])
        current_t = saved.get("transmissionPct", record["transmissionPct"])
        current_d = saved.get("distributionPct", record["distributionPct"])
        current_s = saved.get("substationPct", record["substationPct"])
        current_o = saved.get("otherPct", record["otherPct"])
        current_nq = saved.get("nqReasonCategory", record["nqReasonCategory"])

        for category in current_categories:
            category_counts[category] += 1
        if record.get("sourceStatus"):
            source_status_counts[record["sourceStatus"]] += 1

        items.append(
            {
                **record,
                "originalCategories": record["categories"],
                "originalConfidence": record["confidence"],
                "originalReasoning": record["reasoning"],
                "originalTransmissionPct": record["transmissionPct"],
                "originalDistributionPct": record["distributionPct"],
                "originalSubstationPct": record["substationPct"],
                "originalOtherPct": record["otherPct"],
                "originalNqReasonCategory": record["nqReasonCategory"],
                "name": current_name,
                "categories": current_categories,
                "confidence": current_confidence,
                "reasoning": current_reasoning,
                "transmissionPct": current_t,
                "distributionPct": current_d,
                "substationPct": current_s,
                "otherPct": current_o,
                "nqReasonCategory": current_nq,
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
                "hubspot_id": item["hubspotId"],
                "record_id": item["id"],
                "index": item["index"],
                "name": item["name"],
                "original_name": item.get("originalName", ""),
                "domain": item.get("domain", ""),
                "official_website_url": item["entityUrl"],
                "hq_state": item.get("hqState", ""),
                "decision": item["decision"],
                "master_status": item.get("sourceStatus", ""),
                "categories": ",".join(item["categories"]),
                "confidence": item["confidence"],
                "transmission_pct": item.get("transmissionPct") if item.get("transmissionPct") is not None else "",
                "distribution_pct": item.get("distributionPct") if item.get("distributionPct") is not None else "",
                "substation_pct": item.get("substationPct") if item.get("substationPct") is not None else "",
                "other_pct": item.get("otherPct") if item.get("otherPct") is not None else "",
                "nq_reason_category": item.get("nqReasonCategory", ""),
                "service_fit": item.get("serviceFit", ""),
                "ownership_fit": item.get("ownershipFit", ""),
                "size_fit": item.get("sizeFit", ""),
                "viability": item.get("viability", ""),
                "website_confidence": item.get("websiteConfidence", ""),
                "owner_names": item.get("ownerNames", ""),
                "ownership": item.get("ownership", ""),
                "company_size": item.get("companySize", ""),
                "aliases": "; ".join(item.get("aliases") or []),
                "ownership_evidence_urls": "; ".join(item.get("ownershipEvidenceUrls") or []),
                "identity_evidence_urls": "; ".join(item.get("identityEvidenceUrls") or []),
                "reasoning": item["reasoning"],
                "comparison_summary": item.get("comparisonSummary", ""),
                "duplicate_domain_cluster": item.get("duplicateDomainCluster", ""),
                "original_categories": ",".join(item["originalCategories"]),
                "original_confidence": item["originalConfidence"],
                "note": item["note"],
                "updated_at": item["updatedAt"],
                "run_id": item["runId"],
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
        record_default = SOURCE_LOOKUP.get(record_id, {})

        categories = payload.get("categories", record_default.get("categories", []))
        confidence = payload.get("confidence", record_default.get("confidence", ""))
        reasoning = payload.get("reasoning", record_default.get("reasoning", ""))
        nq_reason = payload.get("nqReasonCategory", record_default.get("nqReasonCategory", "")) or ""

        t = safe_int(payload.get("transmissionPct"))
        d = safe_int(payload.get("distributionPct"))
        s = safe_int(payload.get("substationPct"))
        o = safe_int(payload.get("otherPct"))

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

        if nq_reason not in VALID_NQ_REASONS:
            self.send_error(HTTPStatus.BAD_REQUEST, "Invalid nq_reason_category")
            return

        # If any of the four pcts is set, ALL four must be set and they must sum to 100.
        any_set = any(v is not None for v in (t, d, s, o))
        all_set = all(v is not None for v in (t, d, s, o))
        if any_set and not all_set:
            # treat missing as 0 to preserve sum, but only if at least one is set
            t = t if t is not None else 0
            d = d if d is not None else 0
            s = s if s is not None else 0
            o = o if o is not None else 0
            all_set = True
        if all_set and t + d + s + o != 100:
            self.send_error(HTTPStatus.BAD_REQUEST, "transmission+distribution+substation+other must equal 100")
            return

        store = load_decisions()
        now = utc_now()
        store["updated_at"] = now
        store["decisions"][record_id] = {
            "decision": decision,
            "note": note,
            "categories": categories,
            "confidence": confidence,
            "reasoning": reasoning,
            "transmissionPct": t,
            "distributionPct": d,
            "substationPct": s,
            "otherPct": o,
            "nqReasonCategory": nq_reason,
            "updated_at": now,
            "name": SOURCE_LOOKUP[record_id]["name"],
            "hubspot_id": SOURCE_LOOKUP[record_id].get("hubspotId", record_id),
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
