export const CURRENCIES = [
  { code: "USD", symbol: "$",   locale: "en-US" },
  { code: "EUR", symbol: "€",   locale: "de-DE" },
  { code: "GBP", symbol: "£",   locale: "en-GB" },
  { code: "JPY", symbol: "¥",   locale: "ja-JP" },
  { code: "CAD", symbol: "C$",  locale: "en-CA" },
  { code: "AUD", symbol: "A$",  locale: "en-AU" },
  { code: "CHF", symbol: "CHF", locale: "de-CH" },
  { code: "CNY", symbol: "¥",   locale: "zh-CN" },
  { code: "INR", symbol: "₹",   locale: "en-IN" },
  { code: "HKD", symbol: "HK$", locale: "zh-HK" },
  { code: "SGD", symbol: "S$",  locale: "en-SG" },
  { code: "MYR", symbol: "RM",  locale: "ms-MY" },
];

// US dividend withholding by the chosen currency's representative country
// (portfolio-dividend treaty rate; statutory 30% where there is no US treaty).
// Currency is a proxy for tax residence — an educational approximation.
export const WITHHOLDING_RATES = {
  USD: 0, EUR: 0.15, GBP: 0.15, JPY: 0.10, CAD: 0.15, AUD: 0.15,
  CHF: 0.15, CNY: 0.10, INR: 0.25, HKD: 0.30, SGD: 0.30, MYR: 0.30,
};

export function withholdingRateFor(currencyCode) {
  return WITHHOLDING_RATES[currencyCode] ?? 0;
}

export function formatMoney(value, currencyCode) {
  const c = CURRENCIES.find((x) => x.code === currencyCode) ?? CURRENCIES[0];
  return new Intl.NumberFormat(c.locale, {
    style: "currency",
    currency: c.code,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatMultiple(multiple) {
  return `${multiple.toFixed(1)}×`;
}

export function formatPct(returnPct) {
  const sign = returnPct >= 0 ? "+" : "-";
  return `${sign}${Math.abs(returnPct).toFixed(1)}%`;
}

export function computeResult({
  amount,
  priceAtStart,
  priceAtEnd,
  fxToUSDAtStart,
  fxFromUSDAtEnd,
}) {
  const investedUSD = amount * fxToUSDAtStart;
  const shares = investedUSD / priceAtStart;
  const finalValueUSD = shares * priceAtEnd;
  const finalValue = finalValueUSD * fxFromUSDAtEnd;
  const profit = finalValue - amount;
  const returnPct = (finalValue / amount - 1) * 100;
  const multiple = finalValue / amount;
  return { investedUSD, shares, finalValueUSD, finalValue, profit, returnPct, multiple };
}

export function rankResults(entries) {
  const sorted = [...entries].sort((a, b) => {
    if (b.result.finalValue !== a.result.finalValue) {
      return b.result.finalValue - a.result.finalValue;
    }
    return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
  });
  return sorted.map((e, i) => ({ ...e, rank: i + 1 }));
}

export function subtractMonths(isoDate, months) {
  const [y, m, d] = isoDate.split("-").map(Number);
  // Zero-index the day first so setUTCMonth can't roll the date forward into
  // the next month when the target month is shorter than the source day.
  // e.g. "2026-03-31" minus 1 month must land in February, not "2026-03-03".
  const dt = new Date(Date.UTC(y, m - 1, 1));
  dt.setUTCMonth(dt.getUTCMonth() - months);
  // Clamp the day to the last valid day of the resulting month.
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, lastDay));
  return dt.toISOString().slice(0, 10);
}

export function computeRegret(points, opts) {
  const { startDate, monthsEarlier, amount, fxToUSDAtStart, fxFromUSDAtEnd, priceAtEnd, actualFinalValue } = opts;
  const earlierTarget = subtractMonths(startDate, monthsEarlier);
  if (points.length === 0 || earlierTarget < points[0].date) {
    return { available: false, earlierDate: null, earlierFinalValue: null, extraValue: null };
  }
  const pt = points.find((p) => p.date >= earlierTarget) || points[points.length - 1];
  const investedUSD = amount * fxToUSDAtStart;
  const earlierFinalValue = (investedUSD / pt.close) * priceAtEnd * fxFromUSDAtEnd;
  return {
    available: true,
    earlierDate: pt.date,
    earlierFinalValue,
    extraValue: earlierFinalValue - actualFinalValue,
  };
}
