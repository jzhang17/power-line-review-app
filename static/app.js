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
    serviceFit: new Set(),
    ownershipFit: new Set(),
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
  hubspotIdChip: $("#hubspotIdChip"),
  hubspotIdValue: $("#hubspotIdValue"),
  recordName: $("#recordName"),
  recordMeta: $("#recordMeta"),
  recordBadges: $("#recordBadges"),
  dupBanner: $("#dupBanner"),
  reasoningInput: $("#reasoningInput"),
  internalReasoningBody: $("#internalReasoningBody"),
  preEnrichBody: $("#preEnrichBody"),
  preEnrichmentWrap: $("#preEnrichmentWrap"),
  linksList: $("#linksList"),
  noteInput: $("#noteInput"),
  updatedAt: $("#updatedAt"),
  saveIndicator: $("#saveIndicator"),
  qualificationMeta: $("#qualificationMeta"),
  searchInput: $("#searchInput"),
  statusFilters: $("#statusFilters"),
  categoryFilters: $("#categoryFilters"),
  confidenceFilters: $("#confidenceFilters"),
  serviceFitFilters: $("#serviceFitFilters"),
  ownershipFitFilters: $("#ownershipFitFilters"),
  recordCategoryEditor: $("#recordCategoryEditor"),
  recordConfidenceEditor: $("#recordConfidenceEditor"),
  qaSignals: $("#qaSignals"),
  pctPanel: $("#pctPanel"),
  pctT: $("#pctT"),
  pctD: $("#pctD"),
  pctS: $("#pctS"),
  pctO: $("#pctO"),
  pctSum: $("#pctSum"),
  nqReasonRow: $("#nqReasonRow"),
  nqReasonSelect: $("#nqReasonSelect"),
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
  ownershipEvidence: $("#ownershipEvidence"),
  aliasesBody: $("#aliasesBody"),
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
const SERVICE_FIT_OPTIONS = ["strong", "mixed", "weak", "none"];
const OWNERSHIP_FIT_OPTIONS = ["confirmed_fit", "likely_fit", "unknown", "contradicted"];

const SIGNAL_TONE = {
  // service_fit
  strong: "good", mixed: "warn", weak: "bad", none: "bad",
  // ownership_fit
  confirmed_fit: "good", likely_fit: "good", unknown: "warn", contradicted: "bad",
  // size_fit
  good: "good", /*mixed*/ /*weak*/ /*unknown*/
  // viability
  operating: "good", unclear: "warn", inactive: "bad",
  // website_confidence: high/medium/low/none
  high: "good", medium: "warn", low: "warn",
};

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
  if (s === "manual_review" || s === "maybe") return "SRC:MR";
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

async function copyToClipboard(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast(`copied ${text.slice(0, 30)}`, "q");
  } catch (e) {
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); toast(`copied ${text.slice(0, 30)}`, "q"); } catch (_) {}
    ta.remove();
  }
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
    if (state.filters.serviceFit.size && !state.filters.serviceFit.has(item.serviceFit || "")) return false;
    if (state.filters.ownershipFit.size && !state.filters.ownershipFit.has(item.ownershipFit || "")) return false;
    if (q) {
      const hay = [
        item.name, item.entityNotes, item.reasoning, item.entityUrl, item.sourceUrl,
        item.categories.join(" "), item.hubspotId || "", item.id || "",
        item.domain || "", item.hqState || "", item.duplicateDomainCluster || "",
      ].join(" ").toLowerCase();
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
  renderChips(el.serviceFitFilters, SERVICE_FIT_OPTIONS, state.filters.serviceFit, (v) => toggleSet("serviceFit", v), (v) => v[0].toUpperCase() + v.slice(1));
  renderChips(el.ownershipFitFilters, OWNERSHIP_FIT_OPTIONS, state.filters.ownershipFit, (v) => toggleSet("ownershipFit", v), (v) => v.replace(/_/g, " "));
}

function renderList() {
  const items = orderedFiltered();
  state.filteredIds = items.map((i) => i.id);

  if (!state.filteredIds.includes(state.selectedId)) {
    state.selectedId = state.filteredIds[0] || null;
  }

  el.queueSummary.textContent = `${items.length} / ${state.items.length}`;

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
    else if (item.sourceStatus === "manual_review" || item.sourceStatus === "maybe") srcPill = `<span class="pill pill-src-mr">src:mr</span>`;

    const cats = item.categories.map((c) => `<span class="pill pill-cat">${c}</span>`).join("");
    const dupPill = item.duplicateDomainCluster ? `<span class="pill pill-dup" title="${esc(item.duplicateDomainCluster)}">dup</span>` : "";
    const hsId = item.hubspotId ? `<span class="record-hubspot">${esc(item.hubspotId)}</span>` : "";

    fragments.push(`<button class="record-item ${isActive ? "active" : ""} ${isReviewed ? "reviewed" : ""} ${srcClass}" data-id="${esc(item.id)}">
      <div class="record-row-top">
        <span class="record-idx">${item.index}</span>
        <span class="record-name">${esc(item.name)}</span>
        ${decisionPill}
      </div>
      <div class="record-row-mid">${hsId}${item.hqState ? `<span class="pill pill-state">${esc(item.hqState)}</span>` : ""}</div>
      <div class="record-row-bottom">${srcPill}${cats}${dupPill}<span class="pill-conf">${esc(item.confidence || "")}</span></div>
    </button>`);
  }

  el.recordList.innerHTML = fragments.join("");

  const activeEl = el.recordList.querySelector(".record-item.active");
  if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
}

function renderQaSignals(item) {
  const cells = [
    { label: "Service", value: item.serviceFit },
    { label: "Ownership", value: item.ownershipFit },
    { label: "Size", value: item.sizeFit },
    { label: "Viability", value: item.viability },
    { label: "Website", value: item.websiteConfidence },
  ];
  const html = cells.map(({ label, value }) => {
    const v = (value || "").trim();
    if (!v) return `<div class="qa-cell qa-empty"><span class="qa-label">${label}</span><span class="qa-value">—</span></div>`;
    const tone = SIGNAL_TONE[v] || "neutral";
    const display = v.replace(/_/g, " ");
    return `<div class="qa-cell qa-${tone}"><span class="qa-label">${label}</span><span class="qa-value">${esc(display)}</span></div>`;
  }).join("");
  el.qaSignals.innerHTML = html;
}

function renderPctPanel(item) {
  el.pctT.value = item.transmissionPct ?? "";
  el.pctD.value = item.distributionPct ?? "";
  el.pctS.value = item.substationPct ?? "";
  el.pctO.value = item.otherPct ?? "";
  updatePctSum();
}

function updatePctSum() {
  const t = parseInt(el.pctT.value, 10) || 0;
  const d = parseInt(el.pctD.value, 10) || 0;
  const s = parseInt(el.pctS.value, 10) || 0;
  const o = parseInt(el.pctO.value, 10) || 0;
  const sum = t + d + s + o;
  el.pctSum.textContent = `sum: ${sum}`;
  el.pctSum.classList.toggle("ok", sum === 100);
  el.pctSum.classList.toggle("bad", sum !== 0 && sum !== 100);
}

function renderDupBanner(item) {
  if (item.duplicateDomainCluster) {
    const siblings = state.items.filter(
      (x) => x.id !== item.id && x.duplicateDomainCluster === item.duplicateDomainCluster,
    );
    el.dupBanner.classList.remove("hidden");
    el.dupBanner.innerHTML = `<span class="dup-banner-icon">⧉</span> shares domain with ${siblings.length} other record${siblings.length === 1 ? "" : "s"} <span class="dup-banner-meta">${esc(item.duplicateDomainCluster)}</span> <button id="jumpDupBtn" class="btn-link">next sibling</button>`;
    const btn = document.getElementById("jumpDupBtn");
    if (btn) btn.addEventListener("click", () => jumpToDupSibling(item));
  } else {
    el.dupBanner.classList.add("hidden");
    el.dupBanner.innerHTML = "";
  }
}

function jumpToDupSibling(item) {
  if (!item.duplicateDomainCluster) return;
  const siblings = state.items.filter(
    (x) => x.id !== item.id && x.duplicateDomainCluster === item.duplicateDomainCluster,
  );
  if (!siblings.length) return;
  state.selectedId = siblings[0].id;
  renderList();
  renderDetail();
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

  // HubSpot ID chip
  el.hubspotIdValue.textContent = item.hubspotId || "—";
  el.hubspotIdChip.style.display = item.hubspotId ? "" : "none";

  // Eyebrow
  const eyeParts = [];
  eyeParts.push(item.id);
  if (item.sourceStatus) eyeParts.push(fmtSourceStatus(item.sourceStatus));
  eyeParts.push(fmtDecisionFull(item.decision));
  el.recordEyebrow.textContent = eyeParts.join(" · ");

  el.recordName.textContent = item.name;
  el.recordMeta.textContent = [item.entityNotes, item.sourceOrigin || item.runId, item.sourceDecisionNote].filter(Boolean).join(" | ");

  // Badges
  const badges = [];
  for (const c of item.categories) badges.push(`<span class="pill pill-cat">${c}</span>`);
  if (item.confidence) badges.push(`<span class="pill pill-conf">${esc(item.confidence)}</span>`);
  if (item.hqState) badges.push(`<span class="pill pill-state">${esc(item.hqState)}</span>`);
  if (item.sourceStatus) {
    const cls = item.sourceStatus === "qualified" ? "pill-src-q" : item.sourceStatus === "not_qualified" ? "pill-src-nq" : "pill-src-mr";
    badges.push(`<span class="pill ${cls}">${fmtSourceStatus(item.sourceStatus)}</span>`);
  }
  el.recordBadges.innerHTML = badges.join("");

  // Dup banner
  renderDupBanner(item);

  // QA Signals
  renderQaSignals(item);

  // Reasoning (editable)
  el.reasoningInput.value = item.reasoning || "";
  el.internalReasoningBody.innerHTML = renderMarkdownLinks(item.internalReasoning || "");
  if (item.preEnrichmentReasoning) {
    el.preEnrichmentWrap.classList.remove("hidden");
    el.preEnrichBody.innerHTML = renderMarkdownLinks(item.preEnrichmentReasoning);
  } else {
    el.preEnrichmentWrap.classList.add("hidden");
    el.preEnrichBody.innerHTML = "";
  }

  // % breakdown
  renderPctPanel(item);

  // NQ reason
  const showNq = item.decision === "not_qualified" || item.sourceStatus === "not_qualified";
  el.nqReasonRow.classList.toggle("hidden", !showNq);
  el.nqReasonSelect.value = item.nqReasonCategory || "";

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

  // Intel row (ownership, aliases, comparison)
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
  const hasAny = item.ownerNames || item.ownership || item.preEnrichmentReasoning || item.comparisonSummary || (item.aliases && item.aliases.length) || (item.ownershipEvidenceUrls && item.ownershipEvidenceUrls.length);
  el.intelRow.classList.toggle("hidden", !hasAny);
  if (!hasAny) return;

  if (item.ownerNames) {
    const names = item.ownerNames.split(/[|;]/).map((n) => n.trim()).filter(Boolean);
    el.ownerNames.textContent = names.join(" · ");
  } else {
    el.ownerNames.textContent = "";
  }

  el.ownershipBody.textContent = item.ownership || "";

  // ownership evidence URLs as small links
  if (item.ownershipEvidenceUrls && item.ownershipEvidenceUrls.length) {
    el.ownershipEvidence.innerHTML = item.ownershipEvidenceUrls
      .map((u) => `<a href="${esc(u)}" target="_blank" rel="noreferrer" class="link-pill">${esc(new URL(u, "https://x").host || u)}</a>`)
      .join("");
  } else {
    el.ownershipEvidence.innerHTML = "";
  }

  if (item.aliases && item.aliases.length) {
    el.aliasesBody.textContent = item.aliases.join(" · ");
  } else {
    el.aliasesBody.textContent = "";
  }

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
      reasoning: item.reasoning || "",
      transmissionPct: item.transmissionPct,
      distributionPct: item.distributionPct,
      substationPct: item.substationPct,
      otherPct: item.otherPct,
      nqReasonCategory: item.nqReasonCategory || "",
    }),
  });
  if (!res.ok) {
    let msg = "FAILED";
    try { msg = await res.text(); } catch (_) {}
    el.saveIndicator.textContent = "FAILED";
    el.saveIndicator.title = msg;
    throw new Error(`Save failed: ${msg}`);
  }
  el.saveIndicator.title = "";
  const data = await res.json();
  item.updatedAt = data.updatedAt;
  el.updatedAt.textContent = fmtTimestamp(item.updatedAt);
  el.saveIndicator.textContent = "saved";
  el.saveIndicator.className = "save-status saved";
}

function scheduleSave(item) {
  if (state.saveTimer) clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => saveItem(item).catch(console.error), 250);
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

  if (decision === "qualified") toast(`✓ ${item.name.slice(0, 30)}`, "q");
  else if (decision === "not_qualified") toast(`✗ ${item.name.slice(0, 30)}`, "nq");
  else if (decision === "maybe") toast(`? ${item.name.slice(0, 30)}`, "maybe");

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

el.reasoningInput.addEventListener("input", (e) => {
  const item = selectedItem();
  if (!item) return;
  item.reasoning = e.target.value;
  scheduleSave(item);
});

function pctInputHandler(field) {
  return (e) => {
    const item = selectedItem();
    if (!item) return;
    const v = e.target.value;
    item[field] = v === "" ? null : Math.max(0, Math.min(100, parseInt(v, 10) || 0));
    updatePctSum();
    // only save when sum is 100 or all empty
    const sum = (item.transmissionPct ?? 0) + (item.distributionPct ?? 0) + (item.substationPct ?? 0) + (item.otherPct ?? 0);
    const allNull = item.transmissionPct == null && item.distributionPct == null && item.substationPct == null && item.otherPct == null;
    if (sum === 100 || allNull) scheduleSave(item);
  };
}

el.pctT.addEventListener("input", pctInputHandler("transmissionPct"));
el.pctD.addEventListener("input", pctInputHandler("distributionPct"));
el.pctS.addEventListener("input", pctInputHandler("substationPct"));
el.pctO.addEventListener("input", pctInputHandler("otherPct"));

el.nqReasonSelect.addEventListener("change", (e) => {
  const item = selectedItem();
  if (!item) return;
  item.nqReasonCategory = e.target.value;
  scheduleSave(item);
});

el.hubspotIdChip.addEventListener("click", () => {
  const item = selectedItem();
  if (item?.hubspotId) copyToClipboard(item.hubspotId);
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
  state.filters.serviceFit = new Set();
  state.filters.ownershipFit = new Set();
  el.searchInput.value = "";
  refresh();
});

/* ── Keyboard ── */

document.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName || "";
  const editing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

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
    case "c":
      e.preventDefault();
      { const item = selectedItem(); if (item?.hubspotId) copyToClipboard(item.hubspotId); }
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
    toggle.innerHTML = "&#9790;";
  }
  toggle.addEventListener("click", () => {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    if (isLight) {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("pl-theme", "dark");
      toggle.innerHTML = "&#9788;";
    } else {
      document.documentElement.setAttribute("data-theme", "light");
      localStorage.setItem("pl-theme", "light");
      toggle.innerHTML = "&#9790;";
    }
  });
})();
