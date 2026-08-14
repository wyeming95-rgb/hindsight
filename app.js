import { computeResult, CURRENCIES, formatMoney, formatMultiple, formatPct } from "./calc.js";
import {
  searchSymbols,
  fetchPriceSeries,
  fetchFxToUSD,
  fetchFxFromUSD,
  RateLimitError,
  NotFoundError,
  NetworkError,
  ConfigError,
} from "./api.js";
import { renderChart } from "./chart.js";

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
const profitEl = document.getElementById("profit");
const returnPctEl = document.getElementById("return-pct");
const multipleEl = document.getElementById("multiple");
const summaryEl = document.getElementById("summary");
const noticeEl = document.getElementById("notice");
const errorEl = document.getElementById("error");
const loadingEl = document.getElementById("loading");

// Currently selected ticker symbol (from a suggestion click, or typed value).
let selectedSymbol = "";

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
  currencySelect.value = "MYR";
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
// Step 2: ticker autocomplete
// ---------------------------------------------------------------------------

let debounceTimer = null;
let searchSeq = 0;
// Show the setup message once for a missing API key; don't spam it on every keystroke.
let configErrorShown = false;

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
      // A missing/placeholder API key affects every request, not just this one —
      // surface it once instead of leaving the user with silent, empty suggestions.
      if (err instanceof ConfigError && !configErrorShown) {
        configErrorShown = true;
        errorEl.textContent = friendlyErrorMessage(err);
        showEl(errorEl);
      }
    }
  }, 300);
});

// Hide suggestions when clicking outside the combobox.
document.addEventListener("click", (e) => {
  if (!e.target.closest(".combobox")) {
    hideSuggestions();
  }
});

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
// Step 3 & 4: calculate handler + error handling
// ---------------------------------------------------------------------------

function showEl(el) {
  el.classList.remove("hidden");
}

function hideEl(el) {
  el.classList.add("hidden");
}

function friendlyErrorMessage(err) {
  if (err instanceof ConfigError) {
    return "No API key found. Copy config.example.js to config.js and add your free Twelve Data API key (see the README).";
  }
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

async function handleCalculate() {
  hideEl(resultEl);
  hideEl(errorEl);
  hideEl(noticeEl);
  errorEl.textContent = "";
  noticeEl.textContent = "";

  const symbol = (selectedSymbol || tickerInput.value.trim()).toUpperCase();
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

  showEl(loadingEl);

  try {
    const { points } = await fetchPriceSeries(symbol);

    if (!points || points.length === 0) {
      throw new NotFoundError(`No price data for ${symbol}.`);
    }

    const lastPoint = points[points.length - 1];

    // Determine effective start date, snapping to earliest available data if needed.
    let effectiveStartDate = requestedDate;
    if (requestedDate < points[0].date) {
      effectiveStartDate = points[0].date;
      noticeEl.textContent = `Earliest available data is ${points[0].date}; using that date.`;
      showEl(noticeEl);
    } else if (requestedDate > lastPoint.date) {
      // Requested start is after the last available trading day (e.g. today,
      // a weekend, or a market holiday) — snap forward to the most recent close
      // instead of erroring on an otherwise-plausible date.
      effectiveStartDate = lastPoint.date;
      noticeEl.textContent =
        `No trading data on or after that date; using the most recent trading day, ${lastPoint.date}.`;
      showEl(noticeEl);
    }

    let startPoint = findPriceAtOrAfter(points, effectiveStartDate);
    if (!startPoint && points.length > 0) {
      // Defensive fallback: any gap not covered by the floor/ceiling snaps above
      // still resolves to the most recent available trading day rather than
      // erroring on a date within/near the available range.
      startPoint = lastPoint;
      effectiveStartDate = lastPoint.date;
      noticeEl.textContent =
        `No trading data on or after that date; using the most recent trading day, ${lastPoint.date}.`;
      showEl(noticeEl);
    }
    if (!startPoint) {
      throw new NotFoundError(`No price data on or after ${effectiveStartDate}.`);
    }
    const endPoint = lastPoint;

    const priceAtStart = startPoint.close;
    const priceAtEnd = endPoint.close;
    const startDate = startPoint.date;
    const endDate = endPoint.date;

    const [fxToUSDAtStart, fxFromUSDAtEnd] = await Promise.all([
      fetchFxToUSD(currency, startDate),
      fetchFxFromUSD(currency, endDate),
    ]);

    const result = computeResult({
      amount,
      priceAtStart,
      priceAtEnd,
      fxToUSDAtStart,
      fxFromUSDAtEnd,
    });

    // Render headline (count-up), stats, and summary.
    animateCountUp(headlineEl, result.finalValue, currency);

    profitEl.textContent = formatMoney(result.profit, currency);
    returnPctEl.textContent = formatPct(result.returnPct);
    multipleEl.textContent = formatMultiple(result.multiple);

    const gainClasses = [profitEl, returnPctEl];
    const isGain = result.profit >= 0;
    for (const el of gainClasses) {
      el.classList.remove("is-gain", "is-loss");
      el.classList.add(isGain ? "is-gain" : "is-loss");
    }

    summaryEl.textContent =
      `${formatMoney(amount, currency)} invested in ${symbol} on ${startDate} ` +
      `would be worth ${formatMoney(result.finalValue, currency)} on ${endDate} ` +
      `(${formatPct(result.returnPct)}, ${formatMultiple(result.multiple)}).`;

    // Build chart series: value at each point in the selected currency.
    const series = points
      .filter((p) => p.date >= startDate)
      .map((p) => ({
        date: p.date,
        value: result.shares * p.close * fxFromUSDAtEnd,
      }));
    renderChart(series, currency);

    showEl(resultEl);
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
