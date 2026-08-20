import { eventDateToChartIndex } from "./events-calc.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export function drawEventDots(svg, events, primaryPlotted, onEventClick) {
  if (!svg || !events || !events.length || !primaryPlotted || !primaryPlotted.length) return 0;
  const dates = primaryPlotted.map((p) => p.date);
  let drawn = 0;

  for (const ev of events) {
    const idx = eventDateToChartIndex(dates, ev.date);
    if (idx < 0) continue;
    const p = primaryPlotted[idx];

    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", String(p.x));
    dot.setAttribute("cy", String(p.y));
    dot.setAttribute("r", "4.5");
    dot.setAttribute("class", `event-dot event-dot-${ev.colorClass} event-dot-${ev.source}`);

    const fire = (e) => { e.stopPropagation(); onEventClick(ev); };
    dot.addEventListener("click", fire);

    svg.appendChild(dot);
    drawn++;
  }
  return drawn;
}
