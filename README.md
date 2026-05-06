# Power Line Review App

A small, dependency-free local web app for triaging power-line / T&D / substation contractor sourcing lists.

Drop in a JSON file of candidate companies, run one Python command, and get a fast keyboard-driven UI for marking each one **Qualified / Not Qualified / Maybe**, overriding categories and confidence, and leaving notes. Decisions autosave to a local JSON file. Export to CSV or JSON anytime.

No frameworks, no npm install, no database. Just Python 3.9+ standard library and three static files.

### How it works at a glance

```
  dataset.json  ─▶  python3 server.py  ─▶  http://127.0.0.1:8765
   (your data)        (one command)         (review in browser)
                            │
                            ▼
                  data/review_decisions.json  ─▶  CSV / JSON export
                  (autosaved on every click)
```

### Privacy: nothing leaves your machine

This app runs **entirely on your computer**. The server only listens on `127.0.0.1` (your own loopback address) — it is not reachable from the internet, your network, or anyone else's browser. Your dataset and decisions never touch a cloud service. If you turn off Wi-Fi, the app still works. Nothing is uploaded, tracked, or analytics-collected.

---

## Quick start (60 seconds, technical)

```bash
git clone https://github.com/jzhang17/power-line-review-app.git
cd power-line-review-app
python3 server.py
```

Open <http://127.0.0.1:8765> in your browser. The app loads `data/dataset.json` (**100 real demo records** are included — stratified across qualified / not qualified / maybe with full reasoning and live company URLs) and you can immediately start triaging.

To use your own data, replace `data/dataset.json` with a JSON array of entity records (schema below) and restart the server.

That's the whole setup.

---

## Setup if you don't have git or Python (non-technical)

You don't need a developer to run this. The whole thing is one folder + one Python command. Follow the steps for your operating system. Total time: ~5 minutes.

### Step 1 — Download this folder (no `git` needed)

1. Go to <https://github.com/jzhang17/power-line-review-app>.
2. Click the green **`Code`** button → **`Download ZIP`**.
3. Find the ZIP in your `Downloads/` folder, double-click to unzip.
4. You should now have a folder called `power-line-review-app-main`. Move it somewhere easy, like your Desktop.

### Step 2 — Install Python (skip if already installed)

This app needs Python 3.9 or newer.

**Mac:**
1. Open the **Terminal** app (press <kbd>⌘ Space</kbd>, type "terminal", hit Enter).
2. Type `python3 --version` and press Enter.
   - If it prints something like `Python 3.11.0`, you're done with this step. Skip to Step 3.
   - If it says "command not found" or a version older than 3.9, continue.
3. Go to <https://www.python.org/downloads/> and click the big yellow **Download Python** button.
4. Open the `.pkg` file from your Downloads folder. Click through the installer (defaults are fine).
5. Re-open Terminal and run `python3 --version` again — you should see the new version number.

**Windows:**
1. Open the **Command Prompt** (press <kbd>⊞ Win</kbd>, type "cmd", hit Enter).
2. Type `python --version` and press Enter.
   - If it prints `Python 3.11.0` or similar, you're done. Skip to Step 3.
   - If you see a Microsoft Store page or "not recognized", continue.
3. Go to <https://www.python.org/downloads/> and click **Download Python**.
4. Open the `.exe` installer. **Important:** check the box "Add Python to PATH" at the bottom of the first installer screen, *then* click "Install Now".
5. Re-open Command Prompt and run `python --version` again.

### Step 3 — Drop in your data file

If we sent you a `dataset.json` file by email:

1. Open the unzipped `power-line-review-app-main` folder.
2. Inside, open the `data/` folder.
3. **Replace** the existing `dataset.json` (the demo) with the one we sent. The filename must stay exactly `dataset.json`.

If we didn't send a file, the demo data (100 records) will load automatically and you can use that to try the app.

### Step 4 — Start the app

**Mac:**
1. Open Terminal.
2. Type `cd ~/Desktop/power-line-review-app-main` and press Enter (adjust the path if you put the folder somewhere else).
3. Type `python3 server.py` and press Enter.

**Windows:**
1. Open Command Prompt.
2. Type `cd %USERPROFILE%\Desktop\power-line-review-app-main` and press Enter.
3. Type `python server.py` and press Enter.

You should see something like:
```
Review app running at http://127.0.0.1:8765
Loaded 3184 record(s). Press Ctrl+C to stop.
```

### Step 5 — Open the app

Open any web browser (Chrome, Safari, Firefox, Edge) and go to:

> <http://127.0.0.1:8765>

You'll land in the review interface. Click any record on the left, then use the **Qualified / Not Qualified / Maybe** buttons (or just press <kbd>Q</kbd> / <kbd>N</kbd> / <kbd>M</kbd>) to decide. Your decisions autosave on every click — there's no "save" button to remember.

When you're done for the day, just close the browser tab. To stop the server entirely, click back into Terminal/Command Prompt and press <kbd>Ctrl</kbd>+<kbd>C</kbd>.

### To resume the next day

1. Open Terminal (Mac) or Command Prompt (Windows).
2. `cd` into the folder again (same command as Step 4).
3. Run `python3 server.py` (Mac) or `python server.py` (Windows).
4. Open <http://127.0.0.1:8765>. All your previous decisions are still there.

### To export your reviewed list

In the top bar of the app, click **CSV** or **JSON** to download. The CSV's first column is the HubSpot ID — drop the file into Excel and it slots straight into your CRM.

### Common snags

- **"address already in use" or "port 8765 in use"**: another copy is already running. Close the other Terminal window, or run `PORT=8766 python3 server.py` to use a different port (then open `http://127.0.0.1:8766`).
- **Browser shows "can't connect"**: the server isn't running. Check that the Terminal window says "Review app running at..." — if it doesn't, run the start command again.
- **"python3: command not found" on Mac**: Step 2 didn't finish. Re-run the installer, then close and reopen Terminal.
- **"python: not recognized" on Windows**: Step 2's "Add Python to PATH" checkbox was missed. Reinstall and check that box, or use `py server.py` instead.
- **macOS "cannot be opened because the developer cannot be verified"**: this app does not ship a binary — only Python files — so this warning shouldn't appear when running `python3 server.py`. If it appears for `Python.pkg` itself during install, right-click the installer and choose **Open**, then **Open** again on the warning dialog.
- **Windows SmartScreen "Microsoft Defender prevented an unrecognized app"**: this is the official `python.exe` installer signed by the Python Software Foundation. Click **More info** → **Run anyway**.
- **Mac/Windows firewall popup ("allow Python to accept incoming connections?")**: you can click **Deny** safely. The app only uses `127.0.0.1` (your own machine), so it doesn't need any network permission.
- **Filename shows up as `dataset.json.txt` on Windows**: Windows hides file extensions by default. In File Explorer, click the **View** menu → check **File name extensions**, then rename to remove the trailing `.txt`. The filename must be exactly `dataset.json`.
- **Browser opens but says "0 records" or shows nothing in the queue**: your `dataset.json` is empty or malformed. Open it in a text editor — the first character should be `[` and the last should be `]`. If you got a `dataset.json.gz` from us, you need to **unzip it first** (double-click on Mac, or use 7-Zip on Windows).
- **You closed Terminal/Command Prompt and the browser stopped working**: that's expected — closing the terminal stops the server. To resume, just re-run the start command.
- **Decisions disappeared after a re-download**: see "Re-downloading without losing your work" below.

### Backing up your work

Your reviews are stored in **one file**: `data/review_decisions.json` inside the app folder. To back up:

1. Open the app folder.
2. Open the `data/` subfolder.
3. Copy `review_decisions.json` somewhere safe — Dropbox, Desktop, email it to yourself, whatever you'd do for a Word doc.

That single file is the entire record of your work. To restore: copy it back into `data/` (replacing whatever's there) and restart the app.

### Re-downloading without losing your work

If you ever re-download the app ZIP from GitHub (or we send you an updated copy), the new download will **not** know about your prior decisions. Before throwing away the old folder:

1. From the **old** folder, copy `data/review_decisions.json`.
2. Paste it into the **new** folder's `data/` directory (replace the file already there).
3. Then start the app from the new folder. All your prior decisions are back.

The dataset (`dataset.json`) and your decisions (`review_decisions.json`) are independent — you can update one without losing the other.

---

## Glossary

A few terms you'll see in the app:

| Term | What it means |
|------|---------------|
| **Qualified / Not Qualified / Maybe** | Your decision per record. Qualified = good fit for outreach. Not Qualified = explicitly rejected. Maybe = needs a second look. |
| **HubSpot ID** | The record's primary key in your CRM. Surfaced as a copy chip in the detail header (press <kbd>C</kbd>) and the **first column** in CSV export. |
| **Categories** (T / D / S / V / CI) | The kind of utility electrical work the company performs. T = Transmission, D = Distribution, S = Substation, V = Vegetation management, CI = Commercial & Industrial (typically out-of-scope). |
| **Confidence** (high / medium / low) | How sure the qualification pipeline was about its initial verdict. You can override per record. |
| **% breakdown** | Estimated split of the company's work across T / D / S / Other (sums to 100). Sourced from the company's own website where evidence supports it. |
| **QA Signals** | Five quick chips in the detail pane summarizing the underlying gates: service fit, ownership fit, size fit, viability, website confidence. Hover for the literal value. |
| **NQ reason category** | When a record is Not Qualified, this tags *why* — services unrelated to grid work, ownership misfit (PE/public/ESOP), size misfit (too large), defunct, non-US, or evidence insufficient. Use this to sort the rejections. |
| **Duplicate domain cluster** | Multiple input records share a single website domain. They all carry the same cluster label and the detail pane shows a "next sibling" link to jump between them. |
| **Source / src pill** | The pipeline's initial recommendation (`src:q`, `src:nq`, `src:mr`). Always shown alongside your decision so you can see when you overrode the AI. |

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
