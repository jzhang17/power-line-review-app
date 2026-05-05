# Power Line Review App

A small, dependency-free local web app for triaging power-line / T&D / substation contractor sourcing lists.

Drop in a JSON file of candidate companies, run one Python command, and get a fast keyboard-driven UI for marking each one **Qualified / Not Qualified / Maybe**, overriding categories and confidence, and leaving notes. Decisions autosave to a local JSON file. Export to CSV or JSON anytime.

No frameworks, no npm install, no database. Just Python 3.9+ standard library and three static files.

---

## Quick start (60 seconds)

```bash
git clone https://github.com/jzhang17/power-line-review-app.git
cd power-line-review-app
python3 server.py
```

Open <http://127.0.0.1:8765> in your browser. The app loads `data/dataset.json` (**100 real demo records** are included — stratified across qualified / not qualified / maybe with full reasoning and live company URLs) and you can immediately start triaging.

To use your own data, replace `data/dataset.json` with a JSON array of entity records (schema below) and restart the server.

That's the whole setup.

---

## What's in the demo dataset

`data/dataset.json` ships with 100 real records sampled from a live power-line / T&D contractor sourcing run. Each record has a real company name, working website, category tags, confidence rating, ownership notes, and ~1,000 chars of reasoning narrative with embedded source links.

| Slice | Count |
|-------|-------|
| Qualified | 65 |
| Not Qualified | 25 |
| Maybe | 10 |
| Categories present | T, D, S, V, CI |
| Confidence mix | high / medium / low |

Press `U` to jump to the first unreviewed record and start clicking.

---

## What you get

- **Queue on the left** — searchable, filterable list of every candidate
- **Detail pane on the right** — name, website, reasoning, ownership, links
- **Decision bar** — one-click (or one-keystroke) Qualified / Not Qualified / Maybe
- **Override controls** — adjust the suggested category tags (T / D / S / V / CI) and confidence (high / medium / low) per record
- **Notes** — free-form per-record
- **Auto-advance** — after every decision, jumps to the next unreviewed
- **Autosave** — every change writes to `data/review_decisions.json`
- **Export** — CSV or JSON of the merged review state from the top bar

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Q` | Mark Qualified |
| `N` | Mark Not Qualified |
| `M` | Mark Maybe |
| `J` / `↓` | Next record |
| `K` / `↑` | Previous record |
| `U` | Jump to next unreviewed |
| `O` | Open the company website in a new tab |
| `S` | Google the company name |
| `C` | Copy the HubSpot ID for the selected record |
| `/` | Focus the search box |
| `Esc` | Blur input / exit notes |

---

## Category taxonomy

| Tag | Meaning |
|-----|---------|
| `T` | Transmission line construction |
| `D` | Distribution line construction |
| `S` | Substation construction |
| `V` | Vegetation management / line clearance |
| `CI` | Commercial & Industrial electrical (typically out-of-scope) |

A record can carry multiple tags (e.g., `["T", "D", "S"]` for a full-scope T&D contractor).

---

## Data schema

`data/dataset.json` is a JSON array of objects. Only `name` is strictly required — everything else is optional but improves the review experience.

```json
[
  {
    "record_id": "29279763251",
    "hubspot_id": "29279763251",
    "name": "Northwind Transmission Constructors",
    "original_name": "Northwind Transmission Constructors",
    "domain": "northwind-transmission.example",
    "official_website_url": "https://www.northwind-transmission.example",
    "hq_state": "ID",
    "categories": ["T", "S"],
    "confidence": "high",
    "master_status": "qualified",
    "transmission_pct": 60,
    "distribution_pct": 0,
    "substation_pct": 35,
    "other_pct": 5,
    "service_fit": "strong",
    "ownership_fit": "confirmed_fit",
    "size_fit": "good",
    "viability": "operating",
    "website_confidence": "high",
    "nq_reason_category": "n/a",
    "owner_names": "Patricia Holt; Mark Holt",
    "ownership": "Family-owned, second generation",
    "company_size": "180 employees",
    "aliases": ["Northwind T&D", "NTC"],
    "ownership_evidence_urls": ["https://..."],
    "identity_evidence_urls": ["https://..."],
    "reasoning": "Idaho-based EPC contractor for 69-500kV transmission and substation builds. Family-owned, ~180 employees, plausible acquisition target.",
    "internal_reasoning": "Per their [services page](https://...) the company performs transmission line construction across the Northwest. Ownership confirmed via [BBB profile](https://...).",
    "pre_enrichment_reasoning": "Pass 1 rationale from the qualification stage.",
    "comparison_summary": "categories changed from T to T/S; adjudicated from manual_review to qualified.",
    "review_resolution_notes": "Pass 2 confirmed substation work via project list.",
    "source_origin": "hh_exclusion_v2_20260504",
    "duplicate_domain_cluster": ""
  }
]
```

### Field reference

| Field | Type | Notes |
|-------|------|-------|
| `record_id` | string | Stable id used to key decisions. Auto-generated if omitted. |
| `hubspot_id` | string | HubSpot record id. Surfaced as a copy-button chip in the detail header and as **column A** in CSV export — the join key the client uses. Defaults to `record_id` if not provided. |
| `name` | string | Company name shown in the queue. **Required.** |
| `original_name` | string | Name from the input list, before pipeline corrections. |
| `domain` | string | Bare domain. |
| `official_website_url` | string | Full URL. Powers the "Open URL" button and `O` shortcut. |
| `hq_state` | string | Two-letter US state. Shown as a pill in the queue and detail header. |
| `categories` | array of `T` / `D` / `S` / `V` / `CI` | Initial category tags. Reviewers can override. |
| `confidence` | `high` / `medium` / `low` | Initial confidence. Reviewers can override. |
| `master_status` | `qualified` / `not_qualified` / `maybe` / "" | Suggested initial decision (informational — reviewer always decides). |
| `transmission_pct`, `distribution_pct`, `substation_pct`, `other_pct` | int 0-100 | Estimated work-mix percentages. Must sum to 100 if any are set. Reviewer can edit in the detail pane; saved to decisions and exported in the CSV. |
| `service_fit` | `strong` / `mixed` / `weak` / `none` | Shown as a colored chip in the QA Signals panel. |
| `ownership_fit` | `confirmed_fit` / `likely_fit` / `unknown` / `contradicted` | QA Signals panel. |
| `size_fit` | `good` / `mixed` / `weak` / `unknown` | QA Signals panel. |
| `viability` | `operating` / `unclear` / `inactive` | QA Signals panel. |
| `website_confidence` | `high` / `medium` / `low` / `none` | QA Signals panel. |
| `nq_reason_category` | one of `n/a`, `services_not_grid_related`, `ownership_misfit`, `size_misfit`, `defunct`, `non_us`, `evidence_insufficient` | Editable per record when decision = not_qualified. Lets the client sort the rejections by reason. |
| `reasoning` | string (1-3 sentences) | **Editable** in the app. This is the client-facing reasoning that ships in the deliverable. |
| `internal_reasoning` | string (long form OK, markdown links) | Internal-facing reasoning with sourced URLs. Hidden by default; expand `<summary>` to view. URLs are auto-linkified. |
| `pre_enrichment_reasoning` | string | Pass 1 rationale (shown in collapsed `<summary>` for context). |
| `owner_names` | string or array of strings | Shown under "Ownership". |
| `ownership` | string | One-line ownership summary, shown under "Ownership". |
| `company_size` | string | Shown in the meta line. |
| `aliases` | array of strings | Shown in the intel row. |
| `ownership_evidence_urls` | array of strings | Shown as link pills under "Ownership". |
| `identity_evidence_urls` | array of strings | Folded into the Links panel. |
| `comparison_summary` | string | Auto-built diff between Pass 1 and Pass 2 (name change, website change, category change, adjudication). |
| `review_resolution_notes` | string | Prior review notes, if any. |
| `source_origin` | string | Where the record came from in your sourcing pipeline. |
| `duplicate_domain_cluster` | string | If multiple input records share a domain, all of them carry the same cluster label. Shown as a banner in the detail pane with a "next sibling" link. |

---

## Where decisions live

- Every action writes to `data/review_decisions.json` immediately.
- The file is a single JSON object keyed by `record_id`. Safe to inspect, diff, or back up.
- It is **gitignored by default** so you can keep your decisions out of the repo. Remove it from `.gitignore` if you want decisions to travel with the repo.

Example:

```json
{
  "source_file": "dataset.json",
  "updated_at": "2026-04-30T22:14:08+00:00",
  "decisions": {
    "q-0605": {
      "decision": "qualified",
      "categories": ["T", "S"],
      "confidence": "high",
      "note": "Confirmed family ownership via state filings.",
      "name": "Example Power & Line Co.",
      "updated_at": "2026-04-30T22:14:08+00:00"
    }
  }
}
```

---

## Exporting results

From the top bar, click **CSV** or **JSON** — or hit the endpoints directly:

```bash
curl -O http://127.0.0.1:8765/api/export.csv
curl -O http://127.0.0.1:8765/api/export.json
```

Each row contains the original suggestion (`original_categories`, `original_confidence`) alongside the reviewer's final call (`categories`, `confidence`, `decision`, `note`).

---

## Configuration

Override defaults via environment variables:

```bash
DATASET_FILE=/path/to/my_companies.json \
DECISIONS_FILE=/path/to/my_decisions.json \
PORT=9000 \
python3 server.py
```

| Env var | Default |
|---------|---------|
| `DATASET_FILE` | `./data/dataset.json` |
| `DECISIONS_FILE` | `./data/review_decisions.json` |
| `HOST` | `127.0.0.1` |
| `PORT` | `8765` |

---

## Project layout

```
power-line-review-app/
├── server.py                   # 300-line stdlib HTTP server (no deps)
├── static/
│   ├── index.html              # UI shell
│   ├── app.js                  # Vanilla JS — queue, detail, autosave, shortcuts
│   ├── styles.css              # Light/dark themes
│   └── favicon.svg
├── data/
│   ├── dataset.json            # 100 real demo records — replace with yours
│   └── review_decisions.json   # Created on first decision (gitignored)
├── README.md
├── LICENSE
└── .gitignore
```

---

## API (if you want to script against it)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/bootstrap` | Full state — every record merged with saved decisions, plus counts. |
| `POST` | `/api/decision` | Body: `{"id", "decision", "categories", "confidence", "note"}`. Saves and returns `updatedAt`. |
| `GET` | `/api/export.csv` | Downloadable CSV of merged state. |
| `GET` | `/api/export.json` | Same as CSV but JSON. |

---

## Requirements

- Python **3.9+** (uses `dict | list` annotations)
- A modern browser (Chrome, Safari, Firefox, Edge — all recent)

That's it. No `pip install`, no Node, no Docker.

---

## License

MIT — see [LICENSE](LICENSE).
