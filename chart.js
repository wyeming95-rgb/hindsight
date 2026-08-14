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

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function formatDateLabel(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Render a responsive, animated line chart of `series` into the `#chart`
 * container. Safe to call repeatedly (clears prior content) and safe to call
 * with an empty or single-point series.
 *
 * @param {Array<{date: string, value: number}>} series
 * @param {string} currencyCode
 */
export function renderChart(series, currencyCode) {
  const container = document.getElementById("chart");
  if (!container) return;

  container.innerHTML = "";
  container.style.position = "relative";

  if (!series || series.length === 0) {
    return;
  }

  if (series.length === 1) {
    renderSinglePoint(container, series[0], currencyCode);
    return;
  }

  renderLineChart(container, series, currencyCode);
}

function renderSinglePoint(container, point, currencyCode) {
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
  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("cx", String(cx));
  dot.setAttribute("cy", String(cy));
  dot.setAttribute("r", "4");
  dot.setAttribute("class", "chart-dot");
  svg.appendChild(dot);

  container.appendChild(svg);

  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  tooltip.textContent = `${formatDateLabel(point.date)} — ${formatMoney(point.value, currencyCode)}`;
  tooltip.style.left = "50%";
  tooltip.style.top = "50%";
  tooltip.style.transform = "translate(-50%, -140%)";
  container.appendChild(tooltip);
}

function renderLineChart(container, series, currencyCode) {
  const values = series.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    // Degenerate flat series — pad the range so the line isn't zero-height.
    min -= 1;
    max += 1;
  }

  const innerWidth = VB_WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerHeight = VB_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xForIndex = (i) => PAD_LEFT + (i / (series.length - 1)) * innerWidth;
  const yForValue = (v) => PAD_TOP + (1 - (v - min) / (max - min)) * innerHeight;

  const points = series.map((p, i) => ({
    x: xForIndex(i),
    y: yForValue(p.value),
    date: p.date,
    value: p.value,
  }));

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

  // Value line.
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  path.setAttribute("class", "chart-line");
  svg.appendChild(path);

  // Hover guide + marker (hidden until pointer interaction).
  const guide = document.createElementNS(SVG_NS, "line");
  guide.setAttribute("y1", String(PAD_TOP));
  guide.setAttribute("y2", String(VB_HEIGHT - PAD_BOTTOM));
  guide.setAttribute("class", "chart-guide");
  guide.setAttribute("opacity", "0");
  svg.appendChild(guide);

  const dot = document.createElementNS(SVG_NS, "circle");
  dot.setAttribute("r", "4");
  dot.setAttribute("class", "chart-dot");
  dot.setAttribute("opacity", "0");
  svg.appendChild(dot);

  // Transparent overlay captures pointer/touch input across the full chart.
  const overlay = document.createElementNS(SVG_NS, "rect");
  overlay.setAttribute("x", "0");
  overlay.setAttribute("y", "0");
  overlay.setAttribute("width", String(VB_WIDTH));
  overlay.setAttribute("height", String(VB_HEIGHT));
  overlay.setAttribute("class", "chart-overlay");
  svg.appendChild(overlay);

  container.appendChild(svg);

  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  tooltip.hidden = true;
  container.appendChild(tooltip);

  animateDrawIn(path);

  function nearestIndexForClientX(clientX) {
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return 0;
    const relX = ((clientX - rect.left) / rect.width) * VB_WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dist = Math.abs(points[i].x - relX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    }
    return nearest;
  }

  function showAt(index) {
    const p = points[index];

    guide.setAttribute("x1", String(p.x));
    guide.setAttribute("x2", String(p.x));
    guide.setAttribute("opacity", "1");

    dot.setAttribute("cx", String(p.x));
    dot.setAttribute("cy", String(p.y));
    dot.setAttribute("opacity", "1");

    tooltip.hidden = false;
    tooltip.textContent = `${formatDateLabel(p.date)} — ${formatMoney(p.value, currencyCode)}`;

    const rect = svg.getBoundingClientRect();
    const pxX = (p.x / VB_WIDTH) * rect.width;
    const pxY = (p.y / VB_HEIGHT) * rect.height;

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
    dot.setAttribute("opacity", "0");
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
