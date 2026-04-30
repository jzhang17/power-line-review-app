/* ═══════════════════════════════════════════════════
   Power Line Review Triage — App Logic
   Optimized for keyboard-driven flythrough review.
   ═══════════════════════════════════════════════════ */

const state = {
  items: [],
  filteredIds: [],
  selectedId: null,
  filters: {
    search: "",
    statuses: new Set(["all"]),
    categories: new Set(),
    confidence: new Set(),
  },
  saveTimer: null,
  sessionStart: Date.now(),
  reviewCount: 0,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const el = {
  datasetMeta: $("#datasetMeta"),
  topbarStats: $("#topbarStats"),
  progressFill: $("#progressFill"),
  progressLabel: $("#progressLabel"),
  queueSummary: $("#queueSummary"),
  recordList: $("#recordList"),
  emptyState: $("#emptyState"),
  detailCard: $("#detailCard"),
  recordEyebrow: $("#recordEyebrow"),
  recordName: $("#recordName"),
  recordMeta: $("#recordMeta"),
  recordBadges: $("#recordBadges"),
  reasoningBody: $("#reasoningBody"),
  linksList: $("#linksList"),
  noteInput: $("#noteInput"),
  updatedAt: $("#updatedAt"),
  saveIndicator: $("#saveIndicator"),
  qualificationMeta: $("#qualificationMeta"),
  searchInput: $("#searchInput"),
  statusFilters: $("#statusFilters"),
  categoryFilters: $("#categoryFilters"),
  confidenceFilters: $("#confidenceFilters"),
  recordCategoryEditor: $("#recordCategoryEditor"),
  recordConfidenceEditor: $("#recordConfidenceEditor"),
  nextUnreviewedBtn: $("#nextUnreviewedBtn"),
  clearFiltersBtn: $("#clearFiltersBtn"),
  prevBtn: $("#prevBtn"),
  nextBtn: $("#nextBtn"),
  clearDecisionBtn: $("#clearDecisionBtn"),
  openEntityBtn: $("#openEntityBtn"),
  openLinksBtn: $("#openLinksBtn"),
  toastContainer: $("#toastContainer"),
  intelRow: $("#intelRow"),
  ownerNames: $("#ownerNames"),
  ownershipBody: $("#ownershipBody"),
  preEnrichBody: $("#preEnrichBody"),
  comparisonBody: $("#comparisonBody"),
};

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "unreviewed", label: "Unrvwd" },
  { value: "qualified", label: "Qual" },
  { value: "not_qualified", label: "NotQ" },
  { value: "maybe", label: "Maybe" },
];

const CONFIDENCE_OPTIONS = ["high", "medium", "low"];
const CATEGORY_OPTIONS = ["T", "D", "S", "V", "CI"];

/* ── Helpers ── */

function esc(text) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function renderMarkdownLinks(text) {
  return esc(text).replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  );
}

function fmtDecision(d) {
  if (d === "qualified") return "QUAL";
  if (d === "not_qualified") return "NOT Q";
  if (d === "maybe") return "MAYBE";
  return "—";
}

function fmtDecisionFull(d) {
  if (d === "qualified") return "Qualified";
  if (d === "not_qualified") return "Not Qualified";
  if (d === "maybe") return "Maybe";
  return "Unreviewed";
}

function fmtSourceStatus(s) {
  if (s === "qualified") return "SRC:Q";
  if (s === "not_qualified") return "SRC:NQ";
  if (s === "manual_review") return "SRC:MR";
  return "";
}

function fmtTimestamp(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleTimeString();
}

function toast(text, type) {
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.textContent = text;
  el.toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

function selectedItem() {
  return state.items.find((i) => i.id === state.selectedId) || null;
}

function openGoogle() {
  const item = selectedItem();
  if (!item?.name) return;
  window.open(`https://www.google.com/search?q=${encodeURIComponent(item.name)}`, "_blank", "noopener,noreferrer");
}

/* ── Filtering ── */

function filteredItems() {
  const q = state.filters.search.trim().toLowerCase();
  return state.items.filter((item) => {
    const sf = state.filters.statuses;
    if (!sf.has("all")) {
      if (sf.has("unreviewed") && item.decision) return false;
      const explicit = [...sf].filter((v) => v !== "unreviewed");
      if (explicit.length && !explicit.includes(item.decision)) return false;
      if (!explicit.length && !sf.has("unreviewed")) return false;
    }
    if (state.filters.categories.size) {
      if (!item.categories.some((c) => state.filters.categories.has(c))) return false;
    }
    if (state.filters.confidence.size && !state.filters.confidence.has(item.confidence)) return false;
    if (q) {
      const hay = [item.name, item.entityNotes, item.reasoning, item.entityUrl, item.sourceUrl, item.categories.join(" ")].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function orderedFiltered() {
  return [...filteredItems()].sort((a, b) => a.index - b.index);
}

/* ── Rendering ── */

function renderProgress() {
  const reviewed = state.items.filter((i) => i.decision).length;
  const total = state.items.length;
  const pct = total ? (reviewed / total) * 100 : 0;
  el.progressFill.style.width = `${pct}%`;
}

function renderTopbarStats() {
  const reviewed = state.items.filter((i) => i.decision).length;
  const total = state.items.length;
  const qual = state.items.filter((i) => i.decision === "qualified").length;
  const nq = state.items.filter((i) => i.decision === "not_qualified").length;
  const maybe = state.items.filter((i) => i.decision === "maybe").length;
  const unrev = total - reviewed;

  // Reviews per minute
  const elapsed = (Date.now() - state.sessionStart) / 60000;
  const rpm = elapsed > 0.5 ? (state.reviewCount / elapsed).toFixed(1) : "—";

  el.topbarStats.innerHTML = [
    `<span class="stat"><span class="stat-val">${reviewed}</span>/<span>${total}</span></span>`,
    `<span class="stat"><span class="stat-val green">${qual}</span> Q</span>`,
    `<span class="stat"><span class="stat-val red">${nq}</span> NQ</span>`,
    `<span class="stat"><span class="stat-val amber">${maybe}</span> M</span>`,
    `<span class="stat">${unrev} left</span>`,
    `<span class="stat">${rpm}/min</span>`,
  ].join("");
}

function renderChips(container, options, activeSet, onClick, formatter) {
  container.innerHTML = "";
  for (const option of options) {
    const value = typeof option === "string" ? option : option.value;
    const label = typeof option === "string" ? (formatter ? formatter(option) : option) : option.label;
    const chip = document.createElement("button");
    chip.className = `chip ${activeSet.has(value) ? "active" : ""}`;
    chip.textContent = label;
    chip.addEventListener("click", () => onClick(value));
    container.appendChild(chip);
  }
}

function toggleStatus(value) {
  if (value === "all") {
    state.filters.statuses = new Set(["all"]);
  } else {
    const next = new Set(state.filters.statuses);
    next.delete("all");
    next.has(value) ? next.delete(value) : next.add(value);
    state.filters.statuses = next.size ? next : new Set(["all"]);
  }
  refresh();
}

function toggleSet(name, value) {
  const next = new Set(state.filters[name]);
  next.has(value) ? next.delete(value) : next.add(value);
  state.filters[name] = next;
  refresh();
}

function renderFilters() {
  renderChips(el.statusFilters, STATUS_OPTIONS, state.filters.statuses, toggleStatus);
  renderChips(el.categoryFilters, CATEGORY_OPTIONS, state.filters.categories, (v) => toggleSet("categories", v));
  renderChips(el.confidenceFilters, CONFIDENCE_OPTIONS, state.filters.confidence, (v) => toggleSet("confidence", v), (v) => v[0].toUpperCase() + v.slice(1));
}

function renderList() {
  const items = orderedFiltered();
  state.filteredIds = items.map((i) => i.id);

  if (!state.filteredIds.includes(state.selectedId)) {
    state.selectedId = state.filteredIds[0] || null;
  }

  el.queueSummary.textContent = `${items.length} / ${state.items.length}`;

  // Virtual-ish rendering: just build the HTML string for speed
  const fragments = [];
  for (const item of items) {
    const isActive = item.id === state.selectedId;
    const isReviewed = !!item.decision;
    const srcClass = item.sourceStatus === "qualified" ? "src-qualified" : item.sourceStatus === "not_qualified" ? "src-not-qualified" : "";

    let decisionPill = "";
    if (item.decision === "qualified") decisionPill = `<span class="pill pill-q">Q</span>`;
    else if (item.decision === "not_qualified") decisionPill = `<span class="pill pill-nq">NQ</span>`;
    else if (item.decision === "maybe") decisionPill = `<span class="pill pill-maybe">M</span>`;

    let srcPill = "";
    if (item.sourceStatus === "qualified") srcPill = `<span class="pill pill-src-q">src:q</span>`;
    else if (item.sourceStatus === "not_qualified") srcPill = `<span class="pill pill-src-nq">src:nq</span>`;

    const cats = item.categories.map((c) => `<span class="pill pill-cat">${c}</span>`).join("");

    fragments.push(`<button class="record-item ${isActive ? "active" : ""} ${isReviewed ? "reviewed" : ""} ${srcClass}" data-id="${item.id}">
      <div class="record-row-top">
        <span class="record-idx">${item.index}</span>
        <span class="record-name">${esc(item.name)}</span>
        ${decisionPill}
      </div>
      <div class="record-row-bottom">${srcPill}${cats}<span class="pill-conf">${item.confidence}</span></div>
    </button>`);
  }

  el.recordList.innerHTML = fragments.join("");

  // Scroll active into view
  const activeEl = el.recordList.querySelector(".record-item.active");
  if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
}

function renderDetail() {
  const item = selectedItem();
  if (!item) {
    el.emptyState.classList.remove("hidden");
    el.detailCard.classList.add("hidden");
    return;
  }

  el.emptyState.classList.add("hidden");
  el.detailCard.classList.remove("hidden");

  // Header
  const eyeParts = [item.id];
  if (item.sourceStatus) eyeParts.push(fmtSourceStatus(item.sourceStatus));
  eyeParts.push(fmtDecisionFull(item.decision));
  el.recordEyebrow.textContent = eyeParts.join(" · ");

  el.recordName.textContent = item.name;
  el.recordMeta.textContent = [item.entityNotes, item.sourceOrigin || item.runId, item.sourceDecisionNote].filter(Boolean).join(" | ");

  // Badges
  const badges = [];
  for (const c of item.categories) badges.push(`<span class="pill pill-cat">${c}</span>`);
  badges.push(`<span class="pill pill-conf">${item.confidence}</span>`);
  if (item.sourceStatus) {
    const cls = item.sourceStatus === "qualified" ? "pill-src-q" : "pill-src-nq";
    badges.push(`<span class="pill ${cls}">${fmtSourceStatus(item.sourceStatus)}</span>`);
  }
  el.recordBadges.innerHTML = badges.join("");

  // Reasoning
  el.reasoningBody.innerHTML = renderMarkdownLinks(item.reasoning || item.entityNotes || "");

  // Notes
  el.noteInput.value = item.note || "";
  el.updatedAt.textContent = fmtTimestamp(item.updatedAt);

  // Entity URL button
  el.openEntityBtn.disabled = !item.entityUrl;

  // Decision buttons
  for (const btn of $$(".decision-btn")) {
    btn.classList.toggle("active", btn.dataset.decision === item.decision);
  }

  // Qualification editors
  renderQualEditors(item);

  // Intel row (ownership, pre-enrichment, comparison)
  renderIntel(item);

  // Links
  renderLinks(item);
}

function renderQualEditors(item) {
  const bits = [];
  if (item.sourceStatus) bits.push(fmtSourceStatus(item.sourceStatus));
  bits.push(`orig: ${item.originalCategories.length ? item.originalCategories.join("/") : "—"}`);
  bits.push(item.originalConfidence || "—");
  el.qualificationMeta.textContent = bits.join(" · ");

  renderChips(el.recordCategoryEditor, CATEGORY_OPTIONS, new Set(item.categories), (v) => {
    const next = new Set(item.categories);
    next.has(v) ? next.delete(v) : next.add(v);
    item.categories = CATEGORY_OPTIONS.filter((c) => next.has(c));
    scheduleSave(item);
    renderList();
    renderDetail();
  });

  renderChips(
    el.recordConfidenceEditor,
    CONFIDENCE_OPTIONS,
    new Set([item.confidence].filter(Boolean)),
    (v) => {
      item.confidence = item.confidence === v ? "" : v;
      scheduleSave(item);
      renderList();
      renderDetail();
    },
    (v) => v[0].toUpperCase() + v.slice(1),
  );
}

function renderIntel(item) {
  const hasAny = item.ownerNames || item.ownership || item.preEnrichmentReasoning || item.comparisonSummary;
  el.intelRow.classList.toggle("hidden", !hasAny);
  if (!hasAny) return;

  // Owner names — plain text, pipe-separated
  if (item.ownerNames) {
    const names = item.ownerNames.split(/[|;]/).map((n) => n.trim()).filter(Boolean);
    el.ownerNames.textContent = names.join(" · ");
  } else {
    el.ownerNames.textContent = "";
  }

  el.ownershipBody.textContent = item.ownership || "";
  el.preEnrichBody.innerHTML = renderMarkdownLinks(item.preEnrichmentReasoning || "");
  el.comparisonBody.textContent = item.comparisonSummary || "";
}

function renderLinks(item) {
  el.linksList.innerHTML = "";
  if (!item.links.length) {
    el.linksList.innerHTML = `<p class="subtle">No links.</p>`;
    return;
  }
  for (const link of item.links) {
    const a = document.createElement("a");
    a.className = "link-item";
    a.href = link.url;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.innerHTML = `<span class="link-label">${esc(link.label)}</span><span class="link-url">${esc(link.url)}</span>`;
    el.linksList.appendChild(a);
  }
}

/* ── Save ── */

async function saveItem(item) {
  el.saveIndicator.textContent = "saving...";
  el.saveIndicator.className = "save-status saving";
  const res = await fetch("/api/decision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: item.id,
      decision: item.decision || "",
      note: item.note || "",
      categories: item.categories || [],
      confidence: item.confidence || "",
    }),
  });
  if (!res.ok) {
    el.saveIndicator.textContent = "FAILED";
    throw new Error("Save failed");
  }
  const data = await res.json();
  item.updatedAt = data.updatedAt;
  el.updatedAt.textContent = fmtTimestamp(item.updatedAt);
  el.saveIndicator.textContent = "saved";
  el.saveIndicator.className = "save-status saved";
}

function scheduleSave(item) {
  if (state.saveTimer) clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => saveItem(item).catch(console.error), 200);
}

/* ── Actions ── */

function applyDecision(decision) {
  const item = selectedItem();
  if (!item) return;
  const wasUnreviewed = !item.decision;
  const ordered = orderedFiltered();
  const idx = ordered.findIndex((i) => i.id === item.id);
  item.decision = decision;
  scheduleSave(item);

  if (wasUnreviewed && decision) state.reviewCount++;

  // Toast
  if (decision === "qualified") toast(`✓ ${item.name.slice(0, 30)}`, "q");
  else if (decision === "not_qualified") toast(`✗ ${item.name.slice(0, 30)}`, "nq");
  else if (decision === "maybe") toast(`? ${item.name.slice(0, 30)}`, "maybe");

  // Auto-advance to next unreviewed
  if (decision) {
    const loop = [...ordered.slice(idx + 1), ...ordered.slice(0, Math.max(idx + 1, 0))];
    const next = loop.find((i) => !i.decision);
    if (next) state.selectedId = next.id;
  }

  renderProgress();
  renderTopbarStats();
  renderList();
  renderDetail();
}

function moveSelection(step) {
  if (!state.filteredIds.length) return;
  const idx = Math.max(0, state.filteredIds.indexOf(state.selectedId));
  const next = Math.min(state.filteredIds.length - 1, Math.max(0, idx + step));
  state.selectedId = state.filteredIds[next];
  renderList();
  renderDetail();
}

function jumpNextUnreviewed() {
  const items = orderedFiltered();
  const idx = items.findIndex((i) => i.id === state.selectedId);
  const loop = [...items.slice(idx + 1), ...items.slice(0, Math.max(idx + 1, 0))];
  const match = loop.find((i) => !i.decision);
  if (!match) return;
  state.selectedId = match.id;
  renderList();
  renderDetail();
}

function refresh() {
  renderFilters();
  renderProgress();
  renderTopbarStats();
  renderList();
  renderDetail();
}

/* ── Event Delegation for Queue ── */

el.recordList.addEventListener("click", (e) => {
  const btn = e.target.closest(".record-item");
  if (!btn) return;
  state.selectedId = btn.dataset.id;
  renderList();
  renderDetail();
});

/* ── Event Listeners ── */

for (const btn of $$(".decision-btn")) {
  btn.addEventListener("click", () => applyDecision(btn.dataset.decision));
}

el.searchInput.addEventListener("input", (e) => {
  state.filters.search = e.target.value;
  renderList();
  renderDetail();
});

el.noteInput.addEventListener("input", (e) => {
  const item = selectedItem();
  if (!item) return;
  item.note = e.target.value;
  scheduleSave(item);
});

el.nextUnreviewedBtn.addEventListener("click", jumpNextUnreviewed);
el.prevBtn.addEventListener("click", () => moveSelection(-1));
el.nextBtn.addEventListener("click", () => moveSelection(1));
el.clearDecisionBtn.addEventListener("click", () => applyDecision(""));

el.recordName.addEventListener("click", openGoogle);
el.recordName.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openGoogle(); }
});

el.openEntityBtn.addEventListener("click", () => {
  const item = selectedItem();
  if (item?.entityUrl) window.open(item.entityUrl, "_blank", "noopener,noreferrer");
});

el.openLinksBtn.addEventListener("click", () => {
  const item = selectedItem();
  if (!item) return;
  item.links.forEach((l) => window.open(l.url, "_blank", "noopener,noreferrer"));
});

el.clearFiltersBtn.addEventListener("click", () => {
  state.filters.search = "";
  state.filters.statuses = new Set(["all"]);
  state.filters.categories = new Set();
  state.filters.confidence = new Set();
  el.searchInput.value = "";
  refresh();
});

/* ── Keyboard ── */

document.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName || "";
  const editing = tag === "INPUT" || tag === "TEXTAREA";

  if (e.key === "/" && !editing) {
    e.preventDefault();
    el.searchInput.focus();
    el.searchInput.select();
    return;
  }

  if (editing && e.key !== "Escape") return;

  switch (e.key.toLowerCase()) {
    case "arrowdown":
    case "j":
      e.preventDefault();
      moveSelection(1);
      break;
    case "arrowup":
    case "k":
      e.preventDefault();
      moveSelection(-1);
      break;
    case "q":
      e.preventDefault();
      applyDecision("qualified");
      break;
    case "n":
      e.preventDefault();
      applyDecision("not_qualified");
      break;
    case "m":
      e.preventDefault();
      applyDecision("maybe");
      break;
    case "s":
      e.preventDefault();
      openGoogle();
      break;
    case "u":
      e.preventDefault();
      jumpNextUnreviewed();
      break;
    case "o":
      e.preventDefault();
      { const item = selectedItem(); if (item?.entityUrl) window.open(item.entityUrl, "_blank", "noopener,noreferrer"); }
      break;
    case "escape":
      document.activeElement?.blur();
      break;
  }
});

/* ── Boot ── */

async function load() {
  const res = await fetch("/api/bootstrap");
  const data = await res.json();
  state.items = data.items;
  state.selectedId = state.items[0]?.id || null;
  state.sessionStart = Date.now();
  state.reviewCount = 0;

  el.datasetMeta.textContent = `${data.sourceFile} · ${data.total} records`;

  // Jump to first unreviewed
  const firstUnreviewed = state.items.find((i) => !i.decision);
  if (firstUnreviewed) state.selectedId = firstUnreviewed.id;

  refresh();
}

load().catch((err) => {
  console.error(err);
  el.datasetMeta.textContent = "Failed to load data";
});

/* ── Theme Toggle ── */
(function initTheme() {
  const toggle = document.getElementById("themeToggle");
  const saved = localStorage.getItem("pl-theme");
  if (saved === "light") {
    document.documentElement.setAttribute("data-theme", "light");
    toggle.innerHTML = "&#9790;"; // moon
  }
  toggle.addEventListener("click", () => {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    if (isLight) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("pl-theme", "dark");
      toggle.innerHTML = "&#9788;"; // sun
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("pl-theme", "light");
      toggle.innerHTML = "&#9790;"; // moon
    }
  });
})();
