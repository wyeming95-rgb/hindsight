import { formatMoney } from "./calc.js";

// ---------------------------------------------------------------------------
// Interactive SVG line chart for the investment growth series.
// No build step, no dependencies — plain DOM/SVG APIs only.
// ---------------------------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";

// Internal SVG coordinate space. The container scales this responsively via
// CSS (`width: 100%; height: auto`), which preserves this aspect ratio.
const VB_WIDTH = 600;
const VB_HEIGHT = 240;
const PAD_LEFT = 8;
const PAD_RIGHT = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 24;

// Stable color assignments for callers. The primary series (the user's own
// ticker) gets PRIMARY_COLOR; a benchmark comparison gets BENCHMARK_COLOR;
// any further tickers draw from LINE_COLORS in order.
export const PRIMARY_COLOR = "#34d399";
export const BENCHMARK_COLOR = "#fbbf24";
// For extra tickers, in order. Three entries so that with the benchmark off a
// user can draw primary + 3 compare lines (4 total) and every line stays a
// distinct, theme-legible hue: blue, violet, rose (all readable on light/dark).
export const LINE_COLORS = ["#60a5fa", "#c084fc", "#f472b6"];

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function formatDateLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Fill (or replace) a tooltip element's content. A single row renders as the
 * original plain-text "date — value" string; multiple rows render as a date
 * heading plus one swatch/label/value row per series.
 *
 * @param {HTMLElement} tooltip
 * @param {string} date
 * @param {Array<{color: string, label: string, value: number}>} rows
 * @param {string} currencyCode
 */
function setTooltipContent(tooltip, date, rows, currencyCode) {
  tooltip.innerHTML = "";

  if (rows.length <= 1) {
    const value = rows.length === 1 ? rows[0].value : NaN;
    tooltip.textContent = `${formatDateLabel(date)} — ${formatMoney(value, currencyCode)}`;
    return;
  }

  const dateEl = document.createElement("div");
  dateEl.className = "chart-tooltip-date";
  dateEl.textContent = formatDateLabel(date);
  tooltip.appendChild(dateEl);

  for (const row of rows) {
    const rowEl = document.createElement("div");
    rowEl.className = "chart-tooltip-row";

    const swatch = document.createElement("span");
    swatch.className = "chart-tooltip-swatch";
    swatch.style.background = row.color;

    const label = document.createElement("span");
    label.className = "chart-tooltip-label";
    label.textContent = row.label;

    const value = document.createElement("span");
    value.className = "chart-tooltip-value";
    value.textContent = formatMoney(row.value, currencyCode);

    rowEl.appendChild(swatch);
    rowEl.appendChild(label);
    rowEl.appendChild(value);
    tooltip.appendChild(rowEl);
  }
}

function buildLegend(seriesList) {
  const legend = document.createElement("div");
  legend.className = "chart-legend";

  for (const s of seriesList) {
    const item = document.createElement("div");
    item.className = "chart-legend-item";

    const swatch = document.createElement("span");
    swatch.className = "chart-legend-swatch";
    swatch.style.background = s.color;

    const label = document.createElement("span");
    label.className = "chart-legend-label";
    label.textContent = s.label;

    item.appendChild(swatch);
    item.appendChild(label);
    legend.appendChild(item);
  }

  return legend;
}

/**
 * Render a responsive, animated multi-line chart into the `#chart`
 * container. Safe to call repeatedly (clears prior content) and safe to call
 * with an empty list or series whose primary has a single point.
 *
 * @param {Array<{label: string, color: string, points: Array<{date: string, value: number}>}>} seriesList
 * @param {string} currencyCode
 */
export function renderChart(seriesList, currencyCode) {
  const container = document.getElementById("chart");
  if (!container) return;

  container.innerHTML = "";
  container.style.position = "relative";

  if (!seriesList || seriesList.length === 0) {
    return;
  }

  // Drop series with no data — nothing to plot and nothing useful to show in
  // the legend for them.
  const validSeries = seriesList.filter((s) => s && s.points && s.points.length > 0);
  if (validSeries.length === 0) {
    return;
  }

  if (validSeries[0].points.length === 1) {
    renderSinglePoint(container, validSeries, currencyCode);
    return;
  }

  renderLineChart(container, validSeries, currencyCode);
}

function renderSinglePoint(container, seriesList, currencyCode) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${VB_WIDTH} ${VB_HEIGHT}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const baseline = document.createElementNS(SVG_NS, "line");
  baseline.setAttribute("x1", String(PAD_LEFT));
  baseline.setAttribute("x2", String(VB_WIDTH - PAD_RIGHT));
  baseline.setAttribute("y1", String(VB_HEIGHT - PAD_BOTTOM));
  baseline.setAttribute("y2", String(VB_HEIGHT - PAD_BOTTOM));
  baseline.setAttribute("class", "chart-baseline");
  svg.appendChild(baseline);

  const cx = VB_WIDTH / 2;
  const cy = VB_HEIGHT / 2;
  for (const s of seriesList) {
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", String(cx));
    dot.setAttribute("cy", String(cy));
    dot.setAttribute("r", "4");
    dot.setAttribute("class", "chart-dot");
    dot.style.fill = s.color;
    svg.appendChild(dot);
  }

  container.appendChild(svg);

  if (seriesList.length > 1) {
    container.appendChild(buildLegend(seriesList));
  }

  const primaryPoint = seriesList[0].points[0];
  const rows = seriesList
    .filter((s) => s.points[0])
    .map((s) => ({ color: s.color, label: s.label, value: s.points[0].value }));

  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  setTooltipContent(tooltip, primaryPoint.date, rows, currencyCode);
  tooltip.style.left = "50%";
  tooltip.style.top = "50%";
  tooltip.style.transform = "translate(-50%, -140%)";
  container.appendChild(tooltip);
}

function renderLineChart(container, seriesList, currencyCode) {
  // The primary (first) series defines the X domain — index position and
  // dates. Other series are plotted along that same domain, up to however
  // many points they each have.
  const primaryLength = seriesList[0].points.length;

  const allValues = seriesList.flatMap((s) => s.points.map((p) => p.value));
  let min = Math.min(...allValues);
  let max = Math.max(...allValues);
  if (min === max) {
    // Degenerate flat series — pad the range so the line isn't zero-height.
    min -= 1;
    max += 1;
  }

  const innerWidth = VB_WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerHeight = VB_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xForIndex = (i) => PAD_LEFT + (i / (primaryLength - 1)) * innerWidth;
  const yForValue = (v) => PAD_TOP + (1 - (v - min) / (max - min)) * innerHeight;

  const seriesPoints = seriesList.map((s) => {
    const count = Math.min(s.points.length, primaryLength);
    return s.points.slice(0, count).map((p, i) => ({
      x: xForIndex(i),
      y: yForValue(p.value),
      date: p.date,
      value: p.value,
    }));
  });

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${VB_WIDTH} ${VB_HEIGHT}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  // Baseline / axis.
  const baseline = document.createElementNS(SVG_NS, "line");
  baseline.setAttribute("x1", String(PAD_LEFT));
  baseline.setAttribute("x2", String(VB_WIDTH - PAD_RIGHT));
  baseline.setAttribute("y1", String(VB_HEIGHT - PAD_BOTTOM));
  baseline.setAttribute("y2", String(VB_HEIGHT - PAD_BOTTOM));
  baseline.setAttribute("class", "chart-baseline");
  svg.appendChild(baseline);

  // One value line per series, each stroked in its own color.
  const paths = seriesList.map((s, si) => {
    const pts = seriesPoints[si];
    const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", "chart-line");
    path.style.stroke = s.color;
    svg.appendChild(path);
    return path;
  });

  // Hover guide (hidden until pointer interaction).
  const guide = document.createElementNS(SVG_NS, "line");
  guide.setAttribute("y1", String(PAD_TOP));
  guide.setAttribute("y2", String(VB_HEIGHT - PAD_BOTTOM));
  guide.setAttribute("class", "chart-guide");
  guide.setAttribute("opacity", "0");
  svg.appendChild(guide);

  // One hover marker per series.
  const dots = seriesList.map((s) => {
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("r", "4");
    dot.setAttribute("class", "chart-dot");
    dot.setAttribute("opacity", "0");
    dot.style.fill = s.color;
    svg.appendChild(dot);
    return dot;
  });

  // Transparent overlay captures pointer/touch input across the full chart.
  const overlay = document.createElementNS(SVG_NS, "rect");
  overlay.setAttribute("x", "0");
  overlay.setAttribute("y", "0");
  overlay.setAttribute("width", String(VB_WIDTH));
  overlay.setAttribute("height", String(VB_HEIGHT));
  overlay.setAttribute("class", "chart-overlay");
  svg.appendChild(overlay);

  container.appendChild(svg);

  if (seriesList.length > 1) {
    container.appendChild(buildLegend(seriesList));
  }

  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  tooltip.hidden = true;
  container.appendChild(tooltip);

  for (const path of paths) {
    animateDrawIn(path);
  }

  function nearestIndexForClientX(clientX) {
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return 0;
    const relX = ((clientX - rect.left) / rect.width) * VB_WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < primaryLength; i++) {
      const dist = Math.abs(xForIndex(i) - relX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    }
    return nearest;
  }

  function showAt(index) {
    const primaryPoint = seriesPoints[0][index];

    guide.setAttribute("x1", String(primaryPoint.x));
    guide.setAttribute("x2", String(primaryPoint.x));
    guide.setAttribute("opacity", "1");

    const rows = [];
    seriesList.forEach((s, si) => {
      const pts = seriesPoints[si];
      // Clamp to the last available point for a series shorter than primary,
      // rather than skipping it (avoids the tooltip row disappearing/jumping).
      const p = pts[index] ?? pts[pts.length - 1];
      if (!p) return;
      dots[si].setAttribute("cx", String(p.x));
      dots[si].setAttribute("cy", String(p.y));
      dots[si].setAttribute("opacity", "1");
      rows.push({ color: s.color, label: s.label, value: p.value });
    });

    tooltip.hidden = false;
    setTooltipContent(tooltip, primaryPoint.date, rows, currencyCode);

    const rect = svg.getBoundingClientRect();
    const pxX = (primaryPoint.x / VB_WIDTH) * rect.width;
    const pxY = (primaryPoint.y / VB_HEIGHT) * rect.height;

    tooltip.style.left = `${pxX}px`;
    tooltip.style.top = `${pxY}px`;

    // Keep the tooltip from overflowing the container's left/right edges.
    const ttWidth = tooltip.offsetWidth;
    const half = ttWidth / 2;
    let shift = 0;
    if (pxX - half < 0) {
      shift = half - pxX;
    } else if (pxX + half > rect.width) {
      shift = rect.width - (pxX + half);
    }
    tooltip.style.transform = `translate(calc(-50% + ${shift}px), -100%)`;
  }

  function hideHover() {
    guide.setAttribute("opacity", "0");
    for (const dot of dots) {
      dot.setAttribute("opacity", "0");
    }
    tooltip.hidden = true;
  }

  overlay.addEventListener("pointermove", (e) => {
    showAt(nearestIndexForClientX(e.clientX));
  });
  overlay.addEventListener("pointerdown", (e) => {
    showAt(nearestIndexForClientX(e.clientX));
  });
  overlay.addEventListener("pointerleave", hideHover);

  hideHover();
}

function animateDrawIn(path) {
  const length = path.getTotalLength();

  if (prefersReducedMotion()) {
    return;
  }

  path.style.strokeDasharray = `${length}`;
  path.style.strokeDashoffset = `${length}`;
  // Force layout so the browser registers the starting offset before we
  // transition to 0 — otherwise the initial state and the animated state
  // can get coalesced into a single paint and the draw-in never shows.
  path.getBoundingClientRect();

  requestAnimationFrame(() => {
    path.style.transition = "stroke-dashoffset 900ms ease";
    path.style.strokeDashoffset = "0";
  });
}
