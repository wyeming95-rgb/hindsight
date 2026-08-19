export const WINDOW_TRADING_DAYS = { "1D": 1, "1W": 5, "1M": 21 };
export const DEFAULT_WINDOW = "1M";
export const NEUTRAL_BAND = 0.01;

export function resolveAnchorIndex(series, isoDate) {
  let idx = -1;
  for (let i = 0; i < series.length; i++) {
    if (series[i].date <= isoDate) idx = i;
    else break;
  }
  return idx;
}

function moveOverWindow(series, anchorIdx, steps) {
  const lastIdx = series.length - 1;
  const targetIdx = Math.min(anchorIdx + steps, lastIdx);
  const before = series[anchorIdx];
  const after = series[targetIdx];
  const move = (after.close - before.close) / before.close;
  return { before, after, move, partial: anchorIdx + steps > lastIdx };
}

export function abnormalReturn(stockSeries, benchSeries, isoDate, win) {
  const steps = WINDOW_TRADING_DAYS[win] ?? WINDOW_TRADING_DAYS[DEFAULT_WINDOW];
  const anchorIdx = resolveAnchorIndex(stockSeries, isoDate);
  if (anchorIdx < 0) return null;

  const s = moveOverWindow(stockSeries, anchorIdx, steps);
  const result = {
    beforeDate: s.before.date,
    beforeClose: s.before.close,
    afterDate: s.after.date,
    afterClose: s.after.close,
    stockMove: s.move,
    marketMove: null,
    abnormal: null,
    hasMarket: false,
    partial: s.partial,
  };

  if (benchSeries && benchSeries.length) {
    const bAnchor = resolveAnchorIndex(benchSeries, s.before.date);
    const bTarget = resolveAnchorIndex(benchSeries, s.after.date);
    if (bAnchor >= 0 && bTarget >= 0) {
      const marketMove =
        (benchSeries[bTarget].close - benchSeries[bAnchor].close) /
        benchSeries[bAnchor].close;
      result.marketMove = marketMove;
      result.abnormal = s.move - marketMove;
      result.hasMarket = true;
    }
  }
  return result;
}

export function dotClass(abnormal, band = NEUTRAL_BAND) {
  if (abnormal == null || Math.abs(abnormal) <= band) return "flat";
  return abnormal > band ? "beat" : "lag";
}

export function eventDateToChartIndex(chartDates, isoDate) {
  let idx = -1;
  for (let i = 0; i < chartDates.length; i++) {
    if (chartDates[i] <= isoDate) idx = i;
    else break;
  }
  return idx;
}

export function validateEvent(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, error: "empty" };
  const date = raw.date;
  const headline = typeof raw.headline === "string" ? raw.headline.trim() : "";
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "bad date" };
  }
  if (!headline) return { ok: false, error: "empty headline" };
  return {
    ok: true,
    event: {
      date,
      headline,
      category: typeof raw.category === "string" ? raw.category : "other",
      sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl : "",
    },
  };
}
