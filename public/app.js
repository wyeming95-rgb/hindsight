import { computeResult, computeRegret, rankResults, simulateDrip, withholdingRateFor, CURRENCIES, formatMoney, formatMultiple, formatPct } from "./calc.js";
import {
  searchSymbols,
  fetchAllSeries,
  fetchDividends,
  mapSequential,
  fetchFxToUSD,
  fetchFxFromUSD,
  RateLimitError,
  NotFoundError,
  NetworkError,
} from "./api.js";
import { renderChart, PRIMARY_COLOR, BENCHMARK_COLOR, LINE_COLORS } from "./chart.js?v=1";
import { decodeState, buildShareUrl, copyLink, renderCardPng } from "./share.js";
import { track } from "./analytics.js";

// ---------------------------------------------------------------------------
// Element references
// ---------------------------------------------------------------------------

const calculatorForm = document.getElementById("calculator-form");
const tickerInput = document.getElementById("ticker-input");
const suggestionsEl = document.getElementById("suggestions");
const amountInput = document.getElementById("amount-input");
const currencySelect = document.getElementById("currency-select");
const dateInput = document.getElementById("date-input");
const resultEl = document.getElementById("result");
const headlineEl = document.getElementById("headline");
const breakdownEl = document.getElementById("breakdown");
const profitEl = document.getElementById("profit");
const returnPctEl = document.getElementById("return-pct");
const multipleEl = document.getElementById("multiple");
const summaryEl = document.getElementById("summary");
const noticeEl = document.getElementById("notice");
const errorEl = document.getElementById("error");
const loadingEl = document.getElementById("loading");

const benchmarkToggle = document.getElementById("benchmark-toggle");
const compareListEl = document.getElementById("compare-list");
const addCompareBtn = document.getElementById("add-compare-btn");
const rankedResultsEl = document.getElementById("ranked-results");
const verdictEl = document.getElementById("verdict");
const regretEl = document.getElementById("regret");
const presetsEl = document.getElementById("presets");

const shareBarEl = document.getElementById("share-bar");
const copyLinkBtn = document.getElementById("copy-link-btn");
const downloadPngBtn = document.getElementById("download-png-btn");
const toastEl = document.getElementById("toast");

const growCtaEl = document.getElementById("grow-cta");
const affiliateCtaEl = document.getElementById("affiliate-cta");
const waitlistForm = document.getElementById("waitlist-form");
const waitlistEmailEl = document.getElementById("waitlist-email");
const waitlistMsgEl = document.getElementById("waitlist-msg");
const waitlistSubmitEl = document.getElementById("waitlist-submit");

// Maximum number of lines on the chart: 1 primary + up to 3 more
// (benchmark and/or compare tickers), matching chart.js's exported palette
// (PRIMARY_COLOR + BENCHMARK_COLOR + LINE_COLORS).
const MAX_LINES = 4;

// Currently selected ticker symbol (from a suggestion click, or typed value).
let selectedSymbol = "";

// Snapshot of the primary result, captured after each successful calculation,
// used by the "Download image" button (Task 8). Null until a calc succeeds.
let lastCardData = null;
let lastPngFilename = "what-if.png";

// ---------------------------------------------------------------------------
// Step 1: currency dropdown + date max
// ---------------------------------------------------------------------------

function initCurrencySelect() {
  currencySelect.innerHTML = "";
  for (const c of CURRENCIES) {
    const opt = document.createElement("option");
    opt.value = c.code;
    opt.textContent = `${c.code} — ${c.symbol}`;
    currencySelect.appendChild(opt);
  }
  currencySelect.value = "USD";
}

function initDateMax() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  dateInput.max = `${yyyy}-${mm}-${dd}`;
}

initCurrencySelect();
initDateMax();

// ---------------------------------------------------------------------------
// Theme toggle: cycle System -> Light -> Dark, persisted to localStorage
// ---------------------------------------------------------------------------
//
// The pre-paint inline script in index.html has already applied any saved
// choice to <html data-theme>, and CSS shows the matching icon; this only
// handles cycling on click, persistence, an eased cross-fade, and the
// accessible label. "System" is represented by the absence of data-theme.

const themeToggle = document.getElementById("theme-toggle");
const THEME_ORDER = ["system", "light", "dark"];
const THEME_LABELS = { system: "System", light: "Light", dark: "Dark" };

function currentTheme() {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" || attr === "dark" ? attr : "system";
}

function nextTheme(mode) {
  return THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length];
}

function updateThemeToggleLabel(mode) {
  const upcoming = nextTheme(mode);
  themeToggle.setAttribute(
    "aria-label",
    `Theme: ${THEME_LABELS[mode]}. Activate to switch to ${THEME_LABELS[upcoming]}.`,
  );
  themeToggle.setAttribute("title", `Theme: ${THEME_LABELS[mode]}`);
}

function applyTheme(mode) {
  const root = document.documentElement;

  // Ease only this deliberate light<->dark change; strip the class after the
  // transition so ordinary interactions keep their own faster timings.
  if (!prefersReducedMotion()) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 340);
  }

  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);

  try {
    if (mode === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", mode);
  } catch {
    /* storage unavailable (private mode / disabled) — theme still applies for the session */
  }

  updateThemeToggleLabel(mode);
}

themeToggle.addEventListener("click", () => {
  applyTheme(nextTheme(currentTheme()));
});

updateThemeToggleLabel(currentTheme());

// ---------------------------------------------------------------------------
// Step 2: ticker autocomplete (primary input)
// ---------------------------------------------------------------------------

let debounceTimer = null;
let searchSeq = 0;

function hideSuggestions() {
  suggestionsEl.innerHTML = "";
  suggestionsEl.classList.add("hidden");
  tickerInput.setAttribute("aria-expanded", "false");
}

function renderSuggestions(results) {
  suggestionsEl.innerHTML = "";
  if (!results || results.length === 0) {
    hideSuggestions();
    return;
  }
  for (const r of results) {
    const li = document.createElement("li");
    li.setAttribute("role", "option");

    const symbolSpan = document.createElement("span");
    symbolSpan.className = "suggestion-symbol";
    symbolSpan.textContent = r.symbol;

    const metaSpan = document.createElement("span");
    metaSpan.className = "suggestion-meta";
    metaSpan.textContent = [r.name, r.exchange].filter(Boolean).join(" · ");

    li.appendChild(symbolSpan);
    li.appendChild(metaSpan);

    li.addEventListener("click", () => {
      tickerInput.value = r.symbol;
      selectedSymbol = r.symbol;
      hideSuggestions();
    });

    suggestionsEl.appendChild(li);
  }
  suggestionsEl.classList.remove("hidden");
  tickerInput.setAttribute("aria-expanded", "true");
}

tickerInput.addEventListener("input", () => {
  // Typing invalidates any previously selected suggestion; fall back to raw text.
  selectedSymbol = "";

  const query = tickerInput.value.trim();
  if (debounceTimer) clearTimeout(debounceTimer);

  if (!query) {
    hideSuggestions();
    return;
  }

  const seq = ++searchSeq;
  debounceTimer = setTimeout(async () => {
    try {
      const results = await searchSymbols(query);
      // Ignore stale responses from an earlier, slower request.
      if (seq !== searchSeq) return;
      renderSuggestions(results);
    } catch (err) {
      if (seq !== searchSeq) return;
      hideSuggestions();
    }
  }, 300);
});

// Hide any open suggestion dropdown (primary or compare rows) when clicking
// outside its combobox.
document.addEventListener("click", (e) => {
  if (e.target.closest(".combobox")) return;
  document.querySelectorAll(".combobox .suggestions").forEach((ul) => {
    ul.innerHTML = "";
    ul.classList.add("hidden");
    const input = ul.previousElementSibling;
    if (input) input.setAttribute("aria-expanded", "false");
  });
});

// ---------------------------------------------------------------------------
// Step 1 (compare): manage compare-ticker rows
// ---------------------------------------------------------------------------

let compareHintEl = null;

function getCompareRows() {
  return Array.from(compareListEl.querySelectorAll(".compare-row"));
}

// Keeps `#add-compare-btn` and `#benchmark-toggle` in sync with the 4-line
// cap: 1 primary + (benchmark ? 1 : 0) + compare rows.
function updateCompareCapUI() {
  const compareCount = getCompareRows().length;
  const benchmarkChecked = benchmarkToggle.checked;
  const total = 1 + (benchmarkChecked ? 1 : 0) + compareCount;

  addCompareBtn.disabled = total >= MAX_LINES;
  if (addCompareBtn.disabled) {
    if (!compareHintEl) {
      compareHintEl = document.createElement("p");
      compareHintEl.className = "compare-cap-hint";
      compareHintEl.style.fontSize = "0.8125rem";
      compareHintEl.style.color = "var(--color-muted)";
      compareHintEl.style.margin = "0";
      addCompareBtn.insertAdjacentElement("afterend", compareHintEl);
    }
    compareHintEl.textContent = "Maximum of 4 lines on the chart.";
  } else if (compareHintEl) {
    compareHintEl.remove();
    compareHintEl = null;
  }

  // Prevent checking the benchmark from pushing the total past the cap.
  benchmarkToggle.disabled = !benchmarkChecked && 1 + 1 + compareCount > MAX_LINES;
}

function createCompareRow() {
  const row = document.createElement("div");
  row.className = "compare-row";

  const combobox = document.createElement("div");
  combobox.className = "combobox";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "compare-row-input";
  input.placeholder = "e.g. TSLA";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-autocomplete", "list");

  const suggestions = document.createElement("ul");
  suggestions.className = "suggestions hidden";
  suggestions.setAttribute("role", "listbox");

  combobox.appendChild(input);
  combobox.appendChild(suggestions);

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "compare-row-remove";
  removeBtn.setAttribute("aria-label", "Remove comparison");
  removeBtn.textContent = "×";

  row.appendChild(combobox);
  row.appendChild(removeBtn);

  // Per-row autocomplete, mirroring the primary ticker input's behavior.
  let rowDebounce = null;
  let rowSeq = 0;

  function hideRowSuggestions() {
    suggestions.innerHTML = "";
    suggestions.classList.add("hidden");
    input.setAttribute("aria-expanded", "false");
  }

  function renderRowSuggestions(results) {
    suggestions.innerHTML = "";
    if (!results || results.length === 0) {
      hideRowSuggestions();
      return;
    }
    for (const r of results) {
      const li = document.createElement("li");
      li.setAttribute("role", "option");

      const symbolSpan = document.createElement("span");
      symbolSpan.className = "suggestion-symbol";
      symbolSpan.textContent = r.symbol;

      const metaSpan = document.createElement("span");
      metaSpan.className = "suggestion-meta";
      metaSpan.textContent = [r.name, r.exchange].filter(Boolean).join(" · ");

      li.appendChild(symbolSpan);
      li.appendChild(metaSpan);

      li.addEventListener("click", () => {
        input.value = r.symbol;
        input.dataset.selectedSymbol = r.symbol;
        hideRowSuggestions();
      });

      suggestions.appendChild(li);
    }
    suggestions.classList.remove("hidden");
    input.setAttribute("aria-expanded", "true");
  }

  input.addEventListener("input", () => {
    delete input.dataset.selectedSymbol;
    const query = input.value.trim();
    if (rowDebounce) clearTimeout(rowDebounce);

    if (!query) {
      hideRowSuggestions();
      return;
    }

    const seq = ++rowSeq;
    rowDebounce = setTimeout(async () => {
      try {
        const results = await searchSymbols(query);
        if (seq !== rowSeq) return;
        renderRowSuggestions(results);
      } catch (err) {
        if (seq !== rowSeq) return;
        hideRowSuggestions();
      }
    }, 300);
  });

  removeBtn.addEventListener("click", () => {
    row.remove();
    updateCompareCapUI();
  });

  return row;
}

addCompareBtn.addEventListener("click", () => {
  if (addCompareBtn.disabled) return;
  const row = createCompareRow();
  compareListEl.appendChild(row);
  updateCompareCapUI();
  row.querySelector(".compare-row-input").focus();
});

benchmarkToggle.addEventListener("change", () => {
  updateCompareCapUI();
});

updateCompareCapUI();

// ---------------------------------------------------------------------------
// Step 2 (compare): resolve the symbol list
// ---------------------------------------------------------------------------

function getPrimarySymbol() {
  return (selectedSymbol || tickerInput.value.trim()).toUpperCase();
}

function getCompareRowSymbols() {
  const symbols = [];
  for (const row of getCompareRows()) {
    const input = row.querySelector(".compare-row-input");
    if (!input) continue;
    const sym = (input.dataset.selectedSymbol || input.value.trim()).toUpperCase();
    if (sym) symbols.push(sym);
  }
  return symbols;
}

// Resolves [primary, (SPY if benchmark checked), ...compare rows],
// uppercased, de-duplicated (first occurrence wins), capped at MAX_LINES.
function resolveSymbols() {
  const list = [getPrimarySymbol()];
  if (benchmarkToggle.checked) list.push("SPY");
  list.push(...getCompareRowSymbols());

  const seen = new Set();
  const deduped = [];
  for (const s of list) {
    if (!s || seen.has(s)) continue;
    seen.add(s);
    deduped.push(s);
  }
  return deduped.slice(0, MAX_LINES);
}

// Exposed for Task 8 (sharing): the current compare-form state, independent
// of whether a calculation has been run yet.
export function getCompareState() {
  const symbols = resolveSymbols();
  const primary = symbols[0] || "";
  const benchmark = symbols.includes("SPY");
  const compare = symbols.filter((s) => s !== primary && s !== "SPY");

  const rawAmount = amountInput.value.trim();
  const amount = rawAmount === "" ? NaN : Number(rawAmount);

  return {
    stock: primary,
    amount,
    currency: currencySelect.value,
    date: dateInput.value,
    benchmark,
    compare,
  };
}

// ---------------------------------------------------------------------------
// Step 5: count-up animation helper
// ---------------------------------------------------------------------------

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function animateCountUp(el, finalValue, currencyCode, duration = 800) {
  if (prefersReducedMotion()) {
    el.textContent = formatMoney(finalValue, currencyCode);
    return;
  }

  const start = performance.now();

  function frame(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const current = finalValue * progress;
    el.textContent = formatMoney(current, currencyCode);
    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      el.textContent = formatMoney(finalValue, currencyCode);
    }
  }

  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Task 8: toast helper
// ---------------------------------------------------------------------------

let toastTimer = null;

// Reveals #toast with `message`, then hides it again after ~2.5s via a JS
// timer (not an `animationend` listener) so it works the same whether or
// not `prefers-reduced-motion` disables the CSS fade in styles.css.
function showToast(message) {
  toastEl.textContent = message;

  // If the toast is already visible (rapid double-click), briefly re-hide
  // it and force a reflow so removing "hidden" again restarts the CSS fade.
  toastEl.classList.add("hidden");
  void toastEl.offsetWidth;
  toastEl.classList.remove("hidden");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.add("hidden");
    toastTimer = null;
  }, 2500);
}

// ---------------------------------------------------------------------------
// Step 3 & 4: calculate handler + error handling
// ---------------------------------------------------------------------------

function showEl(el) {
  el.classList.remove("hidden");
}

function hideEl(el) {
  el.classList.add("hidden");
}

function friendlyErrorMessage(err) {
  if (err instanceof RateLimitError) {
    return "You've hit the free data limit — try again in a minute.";
  }
  if (err instanceof NotFoundError) {
    return "Couldn't find data for that ticker/date.";
  }
  if (err instanceof NetworkError) {
    return "Network problem — check your connection and retry.";
  }
  return "Something went wrong. Please check your inputs and try again.";
}

function validateInputs(symbol, amount, dateValue) {
  if (!symbol) {
    return "Please enter or select a ticker symbol.";
  }
  if (!amount || !Number.isFinite(amount) || amount <= 0) {
    return "Please enter a valid amount greater than 0.";
  }
  if (!dateValue) {
    return "Please choose an investment date.";
  }
  return null;
}

// Find the first point whose date is on/after `startDate`.
function findPriceAtOrAfter(points, startDate) {
  return points.find((p) => p.date >= startDate) ?? null;
}

// Applies the same date-snap rules used for the primary ticker to any
// series: clamp forward to the earliest available data, clamp back to the
// most recent trading day if the requested date is beyond it, and fall back
// defensively to the last point for any remaining gap.
function computeEffectiveStart(points, requestedDate) {
  const lastPoint = points[points.length - 1];
  let effectiveStartDate = requestedDate;
  let notice = null;

  if (requestedDate < points[0].date) {
    effectiveStartDate = points[0].date;
    notice = `Earliest available data is ${points[0].date}; using that date.`;
  } else if (requestedDate > lastPoint.date) {
    effectiveStartDate = lastPoint.date;
    notice = `No trading data on or after that date; using the most recent trading day, ${lastPoint.date}.`;
  }

  let startPoint = findPriceAtOrAfter(points, effectiveStartDate);
  if (!startPoint) {
    startPoint = lastPoint;
    effectiveStartDate = lastPoint.date;
    notice = `No trading data on or after that date; using the most recent trading day, ${lastPoint.date}.`;
  }

  return { startPoint, endPoint: lastPoint, effectiveStartDate, notice };
}

// Builds a value series aligned to `dates` (the primary's own date axis) by
// carry-forwarding each symbol's own points: for date d, use the latest
// close on/before d; before the symbol's first data point, use its first
// close. This guarantees every chart series is the same length as the
// primary's and that index i is the same date across all series — required
// because chart.js aligns multi-line series by index, not by date.
function buildAlignedValues(dates, points, sharesAtStart, fxFromUSDAtEnd, path) {
  const out = [];
  let idx = 0;
  let lastClose = points.length > 0 ? points[0].close : null;
  let lastMult = path && path.length > 0 ? path[0] : 1;
  for (const d of dates) {
    while (idx < points.length && points[idx].date <= d) {
      lastClose = points[idx].close;
      lastMult = path ? path[idx] : 1;
      idx++;
    }
    out.push({
      date: d,
      value: lastClose == null ? 0 : sharesAtStart * lastMult * lastClose * fxFromUSDAtEnd,
    });
  }
  return out;
}

// Sets (or clears) the shared #notice element from a list of message
// strings (date-snap notices, per-ticker compare errors, ...), skipping
// falsy entries. Built via DOM text nodes (never innerHTML with dynamic
// text) since some strings embed user-typed ticker symbols.
function setNotices(lines) {
  noticeEl.innerHTML = "";
  const filtered = lines.filter(Boolean);
  if (filtered.length === 0) {
    hideEl(noticeEl);
    return;
  }
  if (filtered.length === 1) {
    noticeEl.textContent = filtered[0];
  } else {
    for (const line of filtered) {
      const p = document.createElement("p");
      p.style.margin = "0";
      p.textContent = line;
      noticeEl.appendChild(p);
    }
  }
  showEl(noticeEl);
}

function renderRankedResults(entries, currency) {
  rankedResultsEl.innerHTML = "";
  if (entries.length < 2) return; // .ranked-results:empty is hidden via CSS

  const ranked = rankResults(entries);

  const table = document.createElement("table");
  table.className = "ranked-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const label of ["Rank", "Symbol", "Final value", "Return", "Multiple"]) {
    const th = document.createElement("th");
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const r of ranked) {
    const tr = document.createElement("tr");
    if (r.rank === 1) tr.classList.add("rank-1");

    const cells = [
      String(r.rank),
      r.symbol,
      formatMoney(r.result.finalValue, currency),
      formatPct(r.result.returnPct),
      formatMultiple(r.result.multiple),
    ];
    for (const c of cells) {
      const td = document.createElement("td");
      td.textContent = c;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  rankedResultsEl.appendChild(table);
}

function renderVerdict(primarySymbol, resultsBySymbol, currency) {
  const spyResult = resultsBySymbol.get("SPY");
  if (!spyResult) {
    verdictEl.textContent = "";
    hideEl(verdictEl);
    return;
  }

  const primaryResult = resultsBySymbol.get(primarySymbol);
  const diff = primaryResult.finalValue - spyResult.finalValue;

  // Color the verdict with the same semantic tokens as the profit/return
  // stats: beating the benchmark reads as a gain, lagging as a loss, a tie
  // stays neutral. The verdict is the emotional payload of a compare.
  verdictEl.classList.remove("is-gain", "is-loss");
  if (Math.abs(diff) < 0.005) {
    verdictEl.textContent = "You matched the S&P 500.";
  } else if (diff > 0) {
    verdictEl.textContent = `You beat the S&P 500 by ${formatMoney(diff, currency)}.`;
    verdictEl.classList.add("is-gain");
  } else {
    verdictEl.textContent = `You lagged the S&P 500 by ${formatMoney(Math.abs(diff), currency)}.`;
    verdictEl.classList.add("is-loss");
  }
  showEl(verdictEl);
}

async function handleCalculate() {
  hideEl(resultEl);
  hideEl(errorEl);
  hideEl(noticeEl);
  hideEl(verdictEl);
  hideEl(regretEl);
  hideEl(breakdownEl);
  breakdownEl.textContent = "";
  hideEl(shareBarEl);
  hideEl(growCtaEl);
  errorEl.textContent = "";
  noticeEl.innerHTML = "";
  verdictEl.textContent = "";
  regretEl.textContent = "";
  rankedResultsEl.innerHTML = "";
  lastCardData = null;

  const symbol = getPrimarySymbol();
  // Strict numeric parse: unlike parseFloat, Number() rejects trailing junk
  // ("1000abc" -> NaN) so validateInputs can flag it. Empty/whitespace -> NaN.
  const rawAmount = amountInput.value.trim();
  const amount = rawAmount === "" ? NaN : Number(rawAmount);
  const currency = currencySelect.value;
  const requestedDate = dateInput.value;

  const validationError = validateInputs(symbol, amount, requestedDate);
  if (validationError) {
    errorEl.textContent = validationError;
    showEl(errorEl);
    return;
  }

  // [primary, SPY?, ...compare], uppercased, de-duplicated, capped at 4.
  const symbols = resolveSymbols();

  showEl(loadingEl);

  try {
    // Fetch every ticker's price history in one batch (fetchAllSeries spaces
    // requests to stay under the free-tier rate limit; per-symbol failures
    // come back as {symbol, error} rather than throwing).
    const seriesResults = await fetchAllSeries(symbols);
    const bySymbol = new Map(seriesResults.map((r) => [r.symbol, r]));

    const primaryEntry = bySymbol.get(symbol);
    if (!primaryEntry || primaryEntry.error || !primaryEntry.points || primaryEntry.points.length === 0) {
      // The primary ticker failing aborts the whole calculation, same as
      // the original single-stock flow.
      throw (primaryEntry && primaryEntry.error) || new NotFoundError(`No price data for ${symbol}.`);
    }

    const primaryPoints = primaryEntry.points;
    const primarySnap = computeEffectiveStart(primaryPoints, requestedDate);

    const startDate = primarySnap.startPoint.date;
    const endDate = primarySnap.endPoint.date;
    const priceAtEnd = primarySnap.endPoint.close;

    // FX fetched exactly once (regardless of how many tickers are being
    // compared) and reused for every symbol below — FX is ticker-independent.
    const [fxToUSDAtStart, fxFromUSDAtEnd] = await Promise.all([
      fetchFxToUSD(currency, startDate),
      fetchFxFromUSD(currency, endDate),
    ]);

    const withholdingRate = withholdingRateFor(currency);

    // Symbols that actually have price data (primary guaranteed; compares maybe).
    const symbolsWithData = symbols.filter((sym) => {
      const e = bySymbol.get(sym);
      return e && !e.error && e.points && e.points.length > 0;
    });

    // One dividends call per symbol, sequentially spaced like the price calls.
    // A dividends failure is non-fatal: that symbol falls back to price-only ([]).
    const dividendsBySymbol = new Map();
    await mapSequential(symbolsWithData, async (sym) => {
      try {
        dividendsBySymbol.set(sym, await fetchDividends(sym));
      } catch {
        dividendsBySymbol.set(sym, []);
      }
    }, 250);

    // Per-symbol DRIP path (parallel to that symbol's points), for the chart.
    const pathBySymbol = new Map();

    function resultFor(sym, snap) {
      const points = bySymbol.get(sym).points;
      const dividends = dividendsBySymbol.get(sym) || [];
      const { multiplierAtEnd, path } = simulateDrip(
        points, dividends, snap.startPoint.date, withholdingRate,
      );
      pathBySymbol.set(sym, path);
      return computeResult({
        amount,
        priceAtStart: snap.startPoint.close,
        priceAtEnd: snap.endPoint.close,
        fxToUSDAtStart,
        fxFromUSDAtEnd,
        dividendMultiplier: multiplierAtEnd,
      });
    }

    const primaryResult = resultFor(symbol, primarySnap);

    const resultsBySymbol = new Map([[symbol, primaryResult]]);
    const successfulSymbols = [symbol];
    const compareErrors = [];

    for (const sym of symbols) {
      if (sym === symbol) continue;
      const entry = bySymbol.get(sym);
      if (!entry || entry.error || !entry.points || entry.points.length === 0) {
        compareErrors.push(`Couldn't load ${sym} — skipped.`);
        continue;
      }
      const snap = computeEffectiveStart(entry.points, requestedDate);
      if (!snap.startPoint) {
        compareErrors.push(`Couldn't load ${sym} — skipped.`);
        continue;
      }
      resultsBySymbol.set(sym, resultFor(sym, snap));
      successfulSymbols.push(sym);
    }

    // ---- headline / stats for the PRIMARY stock (unchanged UI) ----
    animateCountUp(headlineEl, primaryResult.finalValue, currency);

    profitEl.textContent = formatMoney(primaryResult.profit, currency);
    returnPctEl.textContent = formatPct(primaryResult.returnPct);
    multipleEl.textContent = formatMultiple(primaryResult.multiple);

    const isGain = primaryResult.profit >= 0;
    for (const el of [profitEl, returnPctEl]) {
      el.classList.remove("is-gain", "is-loss");
      el.classList.add(isGain ? "is-gain" : "is-loss");
    }
    // Tint the whole payoff panel (headline + accent seam) by outcome.
    resultEl.classList.remove("is-gain", "is-loss");
    resultEl.classList.add(isGain ? "is-gain" : "is-loss");

    summaryEl.textContent =
      `${formatMoney(amount, currency)} invested in ${symbol} on ${startDate} ` +
      `would be worth ${formatMoney(primaryResult.finalValue, currency)} on ${endDate} ` +
      `(${formatPct(primaryResult.returnPct)}, ${formatMultiple(primaryResult.multiple)}).`;

    // Breakdown line: shown only when reinvested dividends move the number.
    const zero = formatMoney(0, currency);
    if (formatMoney(primaryResult.dividendComponent, currency) !== zero) {
      const note = withholdingRate > 0
        ? ` (after ${Math.round(withholdingRate * 100)}% US withholding)`
        : "";
      breakdownEl.textContent =
        `Price growth ${formatMoney(primaryResult.priceComponent, currency)} · ` +
        `Dividends reinvested${note} added ${formatMoney(primaryResult.dividendComponent, currency)}.`;
      showEl(breakdownEl);
    } else {
      hideEl(breakdownEl);
    }

    // ---- multi-line chart, date-aligned to the primary's axis ----
    const primaryDates = primaryPoints.filter((p) => p.date >= startDate).map((p) => p.date);

    let extraColorIndex = 0;
    const seriesList = successfulSymbols.map((sym) => {
      const points = bySymbol.get(sym).points;
      const result = resultsBySymbol.get(sym);
      const values = buildAlignedValues(primaryDates, points, result.shares, fxFromUSDAtEnd, pathBySymbol.get(sym));

      let color;
      if (sym === symbol) color = PRIMARY_COLOR;
      else if (sym === "SPY") color = BENCHMARK_COLOR;
      else {
        color = LINE_COLORS[extraColorIndex % LINE_COLORS.length];
        extraColorIndex++;
      }

      return { label: sym, color, points: values };
    });
    renderChart(seriesList, currency);

    // ---- ranked results + verdict ----
    const entries = successfulSymbols.map((sym) => ({ symbol: sym, result: resultsBySymbol.get(sym) }));
    renderRankedResults(entries, currency);
    renderVerdict(symbol, resultsBySymbol, currency);

    // ---- notices: primary date-snap note (if any) + per-ticker skip notes ----
    setNotices([primarySnap.notice, ...compareErrors]);

    // ---- regret meter: "what if you'd invested a year earlier?" (primary stock only) ----
    const regret = computeRegret(primaryPoints, {
      startDate,
      monthsEarlier: 12,
      amount,
      fxToUSDAtStart,
      fxFromUSDAtEnd,
      priceAtEnd,
      actualFinalValue: primaryResult.finalValue,
      dividends: dividendsBySymbol.get(symbol) || [],
      withholdingRate,
    });

    if (!regret.available) {
      regretEl.textContent = "A year earlier is before this stock's price history.";
    } else if (regret.extraValue > 0) {
      regretEl.textContent =
        `If you'd invested a year earlier (${regret.earlierDate}), you'd have ` +
        `${formatMoney(regret.extraValue, currency)} more.`;
    } else {
      regretEl.textContent =
        `Investing a year earlier would've left you ${formatMoney(-regret.extraValue, currency)} ` +
        `worse off — your timing helped.`;
    }
    showEl(regretEl);

    showEl(resultEl);

    // ---- Task 8: share wiring ----
    // Snapshot for the "Download image" button: the primary stock's own
    // aligned value series doubles as the PNG card's sparkline.
    const primarySeries = seriesList.find((s) => s.label === symbol);
    lastCardData = {
      headline: formatMoney(primaryResult.finalValue, currency),
      subtitle: `${formatMoney(amount, currency)} in ${symbol} on ${startDate}`,
      stats: [
        { label: "Return", value: formatPct(primaryResult.returnPct) },
        { label: "Multiple", value: formatMultiple(primaryResult.multiple) },
        { label: "Profit", value: formatMoney(primaryResult.profit, currency) },
      ],
      sparkline: primarySeries ? primarySeries.points : [],
      footer: "Not financial advice · historical/educational",
    };
    lastPngFilename = `what-if-${symbol}.png`;

    // Reflect the current view in the address bar so it can be copied/shared
    // directly, without adding a history entry per calculation. Guarded because
    // replaceState can throw on a file:// origin (location.origin === "null");
    // a failed URL sync must not block the result or the share bar.
    try {
      history.replaceState(null, "", buildShareUrl(getCompareState()));
    } catch {
      /* URL sync unavailable (e.g. file:// origin); share via Copy link still works */
    }
    showEl(shareBarEl);
    showEl(growCtaEl);
    track("result_view", { ticker: tickerInput.value.trim().toUpperCase() });
  } catch (err) {
    errorEl.textContent = friendlyErrorMessage(err);
    showEl(errorEl);
  } finally {
    hideEl(loadingEl);
  }
}

// The Calculate button is a submit button inside <form id="calculator-form">,
// so both a mouse click and pressing Enter in any of its inputs (ticker,
// amount, date) reach this single handler via the form's submit event.
calculatorForm.addEventListener("submit", (e) => {
  e.preventDefault();
  handleCalculate();
});

// ---------------------------------------------------------------------------
// Step 2: preset scenario chips
// ---------------------------------------------------------------------------

// Event-delegated so it works regardless of how many chips are in the DOM.
presetsEl.addEventListener("click", (e) => {
  const chip = e.target.closest(".preset-chip");
  if (!chip) return;

  const stock = chip.dataset.stock;
  const years = Number(chip.dataset.years);
  if (!stock || !Number.isFinite(years)) return;

  tickerInput.value = stock;
  selectedSymbol = stock;
  hideSuggestions();

  // Same local-date formatting as initDateMax, just offset by `years`.
  const today = new Date();
  const target = new Date(today.getFullYear() - years, today.getMonth(), today.getDate());
  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  let iso = `${yyyy}-${mm}-${dd}`;
  if (dateInput.max && iso > dateInput.max) iso = dateInput.max;
  dateInput.value = iso;

  if (!amountInput.value.trim()) {
    amountInput.value = "1000";
  }

  handleCalculate();
});

// ---------------------------------------------------------------------------
// Task 8: share bar buttons
// ---------------------------------------------------------------------------

copyLinkBtn.addEventListener("click", async () => {
  const url = buildShareUrl(getCompareState());
  const ok = await copyLink(url);
  showToast(ok ? "Link copied!" : "Couldn't copy — select the address bar to copy.");
});

downloadPngBtn.addEventListener("click", async () => {
  if (!lastCardData) {
    showToast("Run a calculation first.");
    return;
  }
  const ok = await renderCardPng(lastCardData, lastPngFilename);
  if (!ok) {
    showToast("Couldn't generate the image.");
  }
});

affiliateCtaEl.addEventListener("click", () => {
  track("affiliate_click");
});

waitlistForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = waitlistEmailEl.value.trim();
  // Cheap client check for instant feedback; the server is authoritative.
  if (!/.+@.+\..+/.test(email)) {
    showWaitlistMsg("Enter a valid email.", "is-err");
    return;
  }
  waitlistSubmitEl.disabled = true;
  try {
    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      showWaitlistMsg("You're on the list — thanks!", "is-ok");
      waitlistEmailEl.value = "";
      track("waitlist_submit");
    } else {
      showWaitlistMsg("That didn't work. Try again.", "is-err");
    }
  } catch {
    showWaitlistMsg("Network problem — try again.", "is-err");
  } finally {
    waitlistSubmitEl.disabled = false;
  }
});

function showWaitlistMsg(text, cls) {
  waitlistMsgEl.textContent = text;
  waitlistMsgEl.classList.remove("is-ok", "is-err", "hidden");
  waitlistMsgEl.classList.add(cls);
}

// ---------------------------------------------------------------------------
// Task 8: auto-run from a shared URL on load
// ---------------------------------------------------------------------------

// Populates the form from a decoded share-URL state. Doesn't touch fields
// the state doesn't specify, so e.g. a missing/invalid amount leaves the
// input at its normal default rather than crashing or writing "null".
function applyStateToForm(state) {
  tickerInput.value = state.stock;
  selectedSymbol = state.stock;

  if (Number.isFinite(state.amount)) {
    amountInput.value = String(state.amount);
  }

  if (state.currency && CURRENCIES.some((c) => c.code === state.currency)) {
    currencySelect.value = state.currency;
  }

  if (state.date) {
    dateInput.value = state.date;
  }

  benchmarkToggle.checked = !!state.benchmark;
  updateCompareCapUI();

  for (const sym of state.compare) {
    if (addCompareBtn.disabled) break; // respect the MAX_LINES cap
    const row = createCompareRow();
    compareListEl.appendChild(row);
    const rowInput = row.querySelector(".compare-row-input");
    rowInput.value = sym;
    rowInput.dataset.selectedSymbol = sym;
    updateCompareCapUI();
  }
}

function initFromUrl() {
  const state = decodeState(location.search);
  if (!state.stock) return;
  applyStateToForm(state);
  handleCalculate();
}

initFromUrl();
