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
    "record_id": "demo-0001",
    "name": "Northwind Transmission Constructors",
    "domain": "northwind-transmission.example",
    "official_website_url": "https://www.northwind-transmission.example",
    "categories": ["T", "S"],
    "confidence": "high",
    "master_status": "qualified",
    "source_origin": "demo_seed",
    "owner_names": "Patricia Holt (CEO); Mark Holt (COO); family ownership",
    "ownership": "Family-owned, second generation",
    "company_size": "180 employees",
    "hq_state": "Idaho",
    "reasoning": "Idaho-based EPC contractor specializing in 69kV–500kV overhead transmission and substation builds...",
    "review_resolution_notes": "Confirmed via FERC project list and state contractor licensing database."
  }
]
```

### Field reference

| Field | Type | Notes |
|-------|------|-------|
| `record_id` | string | Stable id used to key decisions. Auto-generated if omitted. |
| `name` | string | Company name shown in the queue. **Required.** |
| `domain` | string | Bare domain. Used in the meta line. |
| `official_website_url` | string | Full URL. Powers the "Open URL" button and `O` shortcut. |
| `categories` | array of `T` / `D` / `S` / `V` / `CI` | Initial category tags. Reviewers can override. |
| `confidence` | `high` / `medium` / `low` | Initial confidence. Reviewers can override. |
| `master_status` | `qualified` / `not_qualified` / `maybe` / "" | Suggested initial decision (purely informational — reviewer always decides). |
| `reasoning` | string (long form OK) | The narrative shown in the main detail pane. URLs are auto-linkified. |
| `owner_names` | string | Shown under "Ownership". |
| `ownership` | string | Shown under "Ownership". |
| `company_size` | string | Shown in the meta line. |
| `hq_state` | string | Shown in the meta line. |
| `source_origin` | string | Where the record came from in your sourcing pipeline. |
| `review_resolution_notes` | string | Prior review notes, if any. |
| `pre_enrichment_reasoning` | string | Earlier-pass reasoning (shown in intel row). |
| `comparison_summary` | string | Diff/adjudication summary (shown in intel row). |

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
